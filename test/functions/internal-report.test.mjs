import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReport, isInvoicePreparationMonday, isScheduledReportTime } from '../../netlify/functions/internal-report.js';

test('internal reports run at 06:00 SAST on Saturdays and Mondays only', () => {
  assert.equal(isScheduledReportTime(new Date('2026-08-24T04:00:00.000Z')), true); // Monday 06:00 SAST
  assert.equal(isScheduledReportTime(new Date('2026-08-29T04:00:00.000Z')), true); // Saturday 06:00 SAST
  assert.equal(isScheduledReportTime(new Date('2026-08-25T04:00:00.000Z')), false);
  assert.equal(isScheduledReportTime(new Date('2026-08-24T03:00:00.000Z')), false);
});

test('internal report includes no delivery instruction or email recipient', () => {
  const report = buildReport({ business: { revenueCents: 125000 }, search: { status: 'not_measured' }, hosting: { status: 'not_measured' } }, false);

  assert.deepEqual(report, {
    business: { revenueCents: 125000 },
    search: { status: 'not_measured' },
    hosting: { status: 'not_measured' },
    measurementCoverage: { search: 'not_measured', hosting: 'not_measured' },
    invoicePreparationReminder: false,
  });
  assert.equal(Object.hasOwn(report, 'email'), false);
  assert.equal(Object.hasOwn(report, 'recipient'), false);
});

test('invoice preparation reminder occurs on the Monday immediately before a new month', () => {
  assert.equal(isInvoicePreparationMonday(new Date('2026-08-31T04:00:00.000Z')), true);
  assert.equal(isInvoicePreparationMonday(new Date('2026-08-17T04:00:00.000Z')), false);
});
