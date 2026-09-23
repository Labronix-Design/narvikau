import assert from 'node:assert/strict';
import test from 'node:test';

import { persistContactLead } from '../../netlify/functions/contact-email.js';
import { persistQuoteLead } from '../../netlify/functions/quote-email.js';

test('a persisted contact lead invalidates only the affected operations snapshots', async () => {
  const invalidated = [];
  const sql = async () => [{ id: 17 }];

  await persistContactLead({
    sql,
    invalidateSections: async (_sql, sections) => invalidated.push(sections),
    lead: { Name: 'Ava Smith', Surname: 'Northside Motors', Phone: '0820000000', Email: 'ava@example.com', Message: 'Dealer enquiry' },
  });

  assert.deepEqual(invalidated, [['business_overview', 'enquiries']]);
});

test('a persisted quote lead invalidates only the affected operations snapshots', async () => {
  const invalidated = [];
  const sql = async () => [{ id: 18 }];

  await persistQuoteLead({
    sql,
    invalidateSections: async (_sql, sections) => invalidated.push(sections),
    lead: { Name: 'Ava Smith', Phone: '0820000000', Email: 'ava@example.com', Product: 'Toolbox', Message: 'Please quote' },
  });

  assert.deepEqual(invalidated, [['business_overview', 'enquiries']]);
});

test('a failed public lead insert does not invalidate the business cache', async () => {
  const invalidated = [];

  await assert.rejects(
    () => persistContactLead({
      sql: async () => { throw new Error('database unavailable'); },
      invalidateSections: async (_sql, sections) => invalidated.push(sections),
      lead: { Name: 'Ava Smith', Email: 'ava@example.com' },
    }),
    { message: 'database unavailable' },
  );
  assert.deepEqual(invalidated, []);
});
