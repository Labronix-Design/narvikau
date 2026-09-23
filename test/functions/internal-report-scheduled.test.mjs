import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandler } from '../../netlify/functions/internal-report-scheduled.js';

test('scheduled report runner persists a snapshot without exposing a web endpoint', async () => {
  const queries = [];
  const sql = async (strings) => {
    queries.push(strings.join(''));
    return [];
  };
  const handler = createHandler({
    getSql: () => sql,
    env: { REPORTING_TIME_ZONE: 'Australia/Sydney' },
    now: () => new Date('2026-08-23T20:00:00.000Z'),
  });

  const response = await handler({});

  assert.equal(response.statusCode, 202);
  assert.deepEqual(JSON.parse(response.body), { status: 'persisted' });
  assert.equal(queries.some((query) => query.includes('internal_report_snapshots')), true);
});
