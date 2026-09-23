import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandler } from '../../netlify/functions/monthly-business-report-scheduled.js';

test('scheduled monthly report targets the completed prior SAST calendar month', async () => {
  let received;
  const handler = createHandler({
    now: () => new Date('2026-09-01T04:00:00.000Z'),
    getSql: () => async () => [],
    deliverMonthlyReport: async (input) => { received = input; return { status: 'sent', period: input.period }; },
  });

  const response = await handler({});

  assert.equal(response.statusCode, 202);
  assert.equal(received.period.startDate, '2026-08-01');
  assert.equal(received.period.endDate, '2026-08-31');
  assert.equal(received.period.complete, true);
  assert.deepEqual(JSON.parse(response.body), { status: 'sent' });
});

test('scheduled monthly report returns configuration failure without sending', async () => {
  const handler = createHandler({
    now: () => new Date('2026-09-01T04:00:00.000Z'),
    getSql: () => async () => [],
    deliverMonthlyReport: async () => ({ status: 'setup_required' }),
  });
  const response = await handler({});

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), { error: 'Monthly internal report delivery is not configured' });
});

test('scheduled monthly report ignores direct invocations outside 06:00 SAST on the first day', async () => {
  let calls = 0;
  const handler = createHandler({
    now: () => new Date('2026-09-02T04:00:00.000Z'),
    getSql: () => async () => [],
    deliverMonthlyReport: async () => { calls += 1; return { status: 'sent' }; },
  });
  const response = await handler({});

  assert.equal(response.statusCode, 202);
  assert.deepEqual(JSON.parse(response.body), { status: 'ignored' });
  assert.equal(calls, 0);
});
