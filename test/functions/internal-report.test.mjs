import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReport, isScheduledReportTime } from '../../netlify/functions/internal-report.js';

test('internal reports run at 06:00 SAST on Saturdays and Mondays only', () => {
  assert.equal(isScheduledReportTime(new Date('2026-08-24T04:00:00.000Z')), true); // Monday 06:00 SAST
  assert.equal(isScheduledReportTime(new Date('2026-08-29T04:00:00.000Z')), true); // Saturday 06:00 SAST
  assert.equal(isScheduledReportTime(new Date('2026-08-25T04:00:00.000Z')), false);
  assert.equal(isScheduledReportTime(new Date('2026-08-24T03:00:00.000Z')), false);
});

test('internal operations report includes no payment, delivery instruction, or email recipient', () => {
  const report = buildReport({ business: { enquiryCount: 4 }, search: { status: 'not_measured' }, hosting: { status: 'not_measured' } });

  assert.deepEqual(report, {
    business: { enquiryCount: 4 },
    search: { status: 'not_measured' },
    hosting: { status: 'not_measured' },
    measurementCoverage: { search: 'not_measured', hosting: 'not_measured' },
  });
  assert.equal(Object.hasOwn(report, 'email'), false);
  assert.equal(Object.hasOwn(report, 'recipient'), false);
  assert.equal(Object.hasOwn(report, 'invoicePreparationReminder'), false);
});
