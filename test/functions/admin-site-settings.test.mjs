import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSiteSettingsHandler } from '../../netlify/functions/admin-site-settings.js';

const theme = {
  version: 1, surface: '#0a0908', surface_raised: '#171513', text: '#f2ede7',
  text_muted: '#c4bdb4', border: '#514c46', accent: '#ea580c', accent_text: '#0a0908',
  focus: '#c1bbb3', radius: 'subtle', density: 'standard',
};
const request = (body) => ({ httpMethod: 'PUT', headers: {}, body: JSON.stringify(body) });
const create = (options = {}) => createAdminSiteSettingsHandler({ verifyToken: async () => true, purgeTags: async () => {}, ...options });

test('admin GET derives a canonical theme from legacy colours while preserving legacy fields', async () => {
  const handler = create({ getSql: () => async () => [{ primary_color: '#123456', background_color: '#ffffff', font_color: '#000000' }] });
  const response = await handler({ httpMethod: 'GET' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    primary_color: '#123456', background_color: '#ffffff', font_color: '#000000',
    theme: { version: 1, surface: '#ffffff', surface_raised: '#f0f0f0', text: '#000000', text_muted: '#333333', border: '#b3b3b3', accent: '#123456', accent_text: '#ffffff', focus: '#404040', radius: 'subtle', density: 'standard' },
  });
});

test('saving a theme lowercases hex, persists parameterised JSONB and synchronises legacy colours before purging', async () => {
  const timeline = [];
  const handler = create({
    getSql: () => async (strings, ...values) => {
      timeline.push('write');
      const query = strings.join(' ');
      assert.match(query, /theme\s*=\s*[^,]*::jsonb/);
      assert.doesNotMatch(query, /#EA580C|#ea580c/);
      assert.ok(values.includes(JSON.stringify(theme)));
      assert.ok(values.includes('#ea580c'));
      assert.ok(values.includes('#0a0908'));
      assert.ok(values.includes('#f2ede7'));
      return [{ font_family: 'Inter', theme }];
    },
    purgeTags: async (tags) => { timeline.push('purge'); assert.deepEqual(tags, ['site-settings', 'catalogue:storefront']); },
  });
  const response = await handler(request({ font_family: 'Inter', primary_color: '#112233', theme: { ...theme, accent: '#EA580C' } }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body).theme, theme);
  assert.deepEqual(timeline, ['write', 'purge']);
});

for (const [name, invalidTheme] of [
  ['unknown keys', { ...theme, custom_css: 'body {}' }],
  ['missing keys', Object.fromEntries(Object.entries(theme).filter(([key]) => key !== 'focus'))],
  ['array', []], ['null', null], ['string', 'dark'],
  ['invalid version', { ...theme, version: 2 }],
  ['string version', { ...theme, version: '1' }],
  ['invalid radius', { ...theme, radius: 'pill' }],
  ['invalid density', { ...theme, density: 'dense' }],
  ['short hex', { ...theme, border: '#fff' }],
  ['CSS injection', { ...theme, accent: '#ffffff; display:none' }],
]) {
  test(`theme save rejects ${name} without database writes or purge`, async () => {
    let writes = 0;
    let purges = 0;
    const handler = create({ getSql: () => async () => { writes++; return [{ theme }]; }, purgeTags: async () => { purges++; } });
    const response = await handler(request({ font_family: 'Inter', theme: invalidTheme }));
    assert.equal(response.statusCode, 400);
    assert.equal(writes, 0);
    assert.equal(purges, 0);
    assert.match(JSON.parse(response.body).error, /theme/i);
  });
}

for (const [name, patch] of [
  ['body text on page', { text: '#0a0908' }],
  ['body text on raised surface', { surface_raised: '#f2ede7' }],
  ['muted text on page', { text_muted: '#333333' }],
  ['accent text', { accent_text: '#ffffff' }],
  ['accent on page surface', { accent: '#0a0908' }],
]) {
  test(`theme save rejects insufficient ${name} contrast`, async () => {
    let writes = 0;
    const handler = create({ getSql: () => async () => { writes++; return [{ theme }]; } });
    const response = await handler(request({ font_family: 'Inter', theme: { ...theme, ...patch } }));
    assert.equal(response.statusCode, 422);
    assert.match(JSON.parse(response.body).error, /contrast/i);
    assert.equal(writes, 0);
  });
}

for (const rawBody of ['{', 'null', '[]', '"hello"']) {
  test(`malformed settings payload ${rawBody} is a safe 400`, async () => {
    const response = await create({ getSql: () => { throw new Error('must not connect'); } })({ httpMethod: 'PUT', headers: {}, body: rawBody });
    assert.equal(response.statusCode, 400);
    assert.doesNotMatch(response.body, /SyntaxError|must not connect/);
  });
}

test('database and client-construction failures return generic 500 without upstream details', async () => {
  for (const getSql of [() => { throw new Error('postgres://secret@db'); }, () => async () => { throw new Error('SELECT secret FROM private'); }]) {
    const response = await create({ getSql })({ httpMethod: 'GET' });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(JSON.parse(response.body), { error: 'Site settings could not be loaded or saved. Please try again.' });
  }
});

test('cache refresh failure reports the saved state without exposing upstream details', async () => {
  const response = await create({ getSql: () => async () => [{ theme }], purgeTags: async () => { throw new Error('secret purge service detail'); } })(request({ font_family: 'Inter', theme }));
  assert.equal(response.statusCode, 503);
  assert.match(JSON.parse(response.body).error, /saved.*refresh.*pending/i);
  assert.doesNotMatch(response.body, /secret purge/);
});

test('unsupported methods and unauthorised calls do not connect to the database', async () => {
  const getSql = () => { throw new Error('must not connect'); };
  const method = await create({ getSql })({ httpMethod: 'DELETE' });
  assert.equal(method.statusCode, 405);
  const denied = await create({ getSql, verifyToken: async () => false })({ httpMethod: 'GET' });
  assert.equal(denied.statusCode, 401);
});

test('legacy colour-only saves cannot bypass contrast validation', async () => {
  let writes = 0;
  const response = await create({ getSql: () => async () => { writes++; return [{}]; } })(request({ font_family: 'Inter', background_color: '#ffffff', font_color: '#ffffff', primary_color: '#ea580c' }));
  assert.equal(response.statusCode, 422);
  assert.match(JSON.parse(response.body).error, /contrast/i);
  assert.equal(writes, 0);
});
