import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReport, createHandler, isScheduledReportTime, persistScheduledReport } from '../../netlify/functions/internal-report.js';

test('internal reports run at 06:00 SAST on Saturdays and Mondays only', () => {
  assert.equal(isScheduledReportTime(new Date('2026-08-24T04:00:00.000Z')), true); // Monday 06:00 SAST
  assert.equal(isScheduledReportTime(new Date('2026-08-29T04:00:00.000Z')), true); // Saturday 06:00 SAST
  assert.equal(isScheduledReportTime(new Date('2026-08-25T04:00:00.000Z')), false);
  assert.equal(isScheduledReportTime(new Date('2026-08-24T03:00:00.000Z')), false);
});

test('internal operations report includes enquiry data but no payment, delivery instruction, or email recipient', () => {
  const report = buildReport({ business: { enquiryCount: 4 }, enquiries: { enquiryCount: 4 }, search: { status: 'not_measured' }, hosting: { status: 'not_measured' } });

  assert.deepEqual(report, {
    business: { enquiryCount: 4 },
    enquiries: { enquiryCount: 4 },
    search: { status: 'not_measured' },
    hosting: { status: 'not_measured' },
    measurementCoverage: { enquiries: 'not_measured', search: 'not_measured', hosting: 'not_measured' },
  });
  assert.equal(Object.hasOwn(report, 'email'), false);
  assert.equal(Object.hasOwn(report, 'recipient'), false);
  assert.equal(Object.hasOwn(report, 'invoicePreparationReminder'), false);
});

test('a refreshed enquiry snapshot is persisted in the scheduled operations report', async () => {
  const writes = [];
  const enquirySnapshot = {
    status: 'ready',
    scope: { enquiries: 'All recorded customer enquiries by their recorded status.' },
    enquiryCount: 7,
    newEnquiries: 2,
  };
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    if (query.includes('FROM control_centre_cache')) {
      return [{ section: 'enquiries', payload: enquirySnapshot, invalidated_at: null }];
    }
    if (query.includes('INSERT INTO internal_report_snapshots')) writes.push({ query, values });
    return [];
  };

  const result = await persistScheduledReport(sql, new Date('2026-08-24T04:00:00.000Z'));

  assert.deepEqual(result, { status: 'persisted' });
  assert.equal(writes.length, 1);
  const payload = JSON.parse(writes[0].values[1]);
  assert.deepEqual(payload.enquiries, enquirySnapshot);
  assert.equal(Object.hasOwn(payload, 'orders'), false);
  assert.equal(Object.hasOwn(payload, 'revenueCents'), false);
});

test('unauthorized internal report reads return 401 before database setup', async () => {
  let databaseAccessed = false;
  let verified = false;
  const handler = createHandler({
    verifyAdminToken: async () => { verified = true; return false; },
    getSql: () => { databaseAccessed = true; throw new Error('database setup must not run'); },
  });

  const response = await handler({ httpMethod: 'GET', headers: {} });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), { error: 'Unauthorized' });
  assert.equal(verified, true);
  assert.equal(databaseAccessed, false);
});
