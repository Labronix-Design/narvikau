import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('global CSP permits only the required Google Analytics origins', async () => {
  const config = await readFile(new URL('../../netlify.toml', import.meta.url), 'utf8');

  assert.match(config, /for = "\/\*"[\s\S]*Content-Security-Policy/);
  assert.match(config, /default-src 'self'/);
  const scriptSource = config.match(/script-src ([^;]+)/)?.[1] ?? '';
  assert.match(scriptSource, /https:\/\/www\.googletagmanager\.com/);
  assert.doesNotMatch(scriptSource, /'unsafe-inline'/);
  assert.match(config, /connect-src [^\n]*https:\/\/www\.google-analytics\.com/);
  assert.match(config, /connect-src [^\n]*https:\/\/region1\.google-analytics\.com/);
  assert.match(config, /object-src 'none'/);
  assert.match(config, /base-uri 'self'/);
});

test('the production build does not emit an inline stylesheet load handler blocked by CSP', async () => {
  const angularConfig = JSON.parse(await readFile(new URL('../../angular.json', import.meta.url), 'utf8'));
  const styles = angularConfig.projects.navrik.architect.build.configurations.production.optimization.styles;

  assert.equal(styles.inlineCritical, false);
});
