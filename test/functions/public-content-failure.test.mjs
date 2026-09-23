import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegalPagesHandler } from '../../netlify/functions/legal-pages.js';
import { createSiteSettingsHandler } from '../../netlify/functions/site-settings.js';

const unavailable = { error: 'Content is temporarily unavailable' };
const failingSql = async () => {
  throw new Error('database unavailable');
};

const endpoints = [
  {
    name: 'site settings',
    createHandler: createSiteSettingsHandler,
    event: { httpMethod: 'GET' },
    emptyRow: [{
      logo_url: null,
      font_family: '',
      primary_color: '',
      hero_slides: [],
      brand_logos: [],
      contact: {},
      trust_bar: [],
    }],
    expectedEmptyBody: {
      logo_url: null,
      font_family: '',
      primary_color: '',
      hero_slides: [],
      brand_logos: [],
      contact: {},
      trust_bar: [],
    },
  },
  {
    name: 'legal page',
    createHandler: createLegalPagesHandler,
    event: { httpMethod: 'GET', queryStringParameters: { page: 'refund' } },
    emptyRow: [{ content: {} }],
    expectedEmptyBody: {},
  },
];

for (const endpoint of endpoints) {
  test(`${endpoint.name} database failure is a non-cacheable unavailable response`, async () => {
    const handler = endpoint.createHandler({ getSql: () => failingSql });

    const response = await handler(endpoint.event);

    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), unavailable);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.headers['Netlify-CDN-Cache-Control'], 'no-store');
  });

  test(`${endpoint.name} preserves an explicitly empty configured record as 200`, async () => {
    const handler = endpoint.createHandler({ getSql: () => async () => endpoint.emptyRow });

    const response = await handler(endpoint.event);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), endpoint.expectedEmptyBody);
  });
}
