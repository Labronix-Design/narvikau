import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMonthlyReport,
  createHandler,
  deliverMonthlyReport,
  monthlyPeriodFor,
  monthlyPeriodTimestampBounds,
  renderMonthlyReportEmail,
} from '../../netlify/functions/monthly-business-report.js';

function monthlySql({ delivery = null, claim = delivery ? null : { send_state: 'sending', attempt_started_at: '2026-08-24T04:00:00.000Z' } } = {}) {
  return async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM leads')) return [{ lead_count: 4, converted_lead_count: 1 }];
    if (query.includes('FROM control_centre_cache')) return [];
    if (query.includes('INSERT INTO monthly_report_deliveries')) return claim ? [claim] : [];
    if (query.includes('SELECT send_state, sent_at')) return delivery ? [delivery] : [];
    return [];
  };
}

test('monthly operations report omits Search Console figures when the cache period is not the report period', () => {
  const report = buildMonthlyReport({
    period: { startDate: '2026-08-01', endDate: '2026-08-24', complete: false },
    business: { leadCount: 4, convertedLeadCount: 1 },
    searchCache: { status: 'ready', period: { startDate: '2026-07-25', endDate: '2026-08-21' }, metrics: { clicks: 900 } },
    hosting: { status: 'ready', supplierCosts: { currency: 'USD', amountMinor: 5000 }, invoiceReady: false },
  });

  assert.deepEqual(report.search, {
    status: 'not_measured',
    explanation: 'Cached Search Console data does not cover this reporting period.',
    data: null,
  });
  assert.deepEqual(report.leads, { status: 'measured', total: 4, converted: 1 });
  assert.equal(Object.hasOwn(report, 'orders'), false);
  assert.equal(report.measurementCoverage.search, 'not_measured');
});

test('monthly operations report preserves the secure Search Console setup explanation when no monthly snapshot can be refreshed', () => {
  const report = buildMonthlyReport({
    period: { startDate: '2026-08-01', endDate: '2026-08-31', complete: true },
    business: {},
    searchCache: { status: 'setup_required', explanation: 'Google Search Console is not configured for monthly reporting yet.' },
    hosting: null,
  });

  assert.deepEqual(report.search, {
    status: 'setup_required',
    explanation: 'Google Search Console is not configured for monthly reporting yet.',
    data: null,
  });
});

test('monthly period uses the current SAST month through today for an initial report', () => {
  assert.deepEqual(monthlyPeriodFor(new Date('2026-08-24T04:00:00.000Z'), 'current'), {
    startDate: '2026-08-01', endDate: '2026-08-24', complete: false, label: 'August 2026',
  });
});

test('monthly period maps SAST month edges to start-inclusive, end-exclusive UTC instants', () => {
  assert.deepEqual(monthlyPeriodTimestampBounds({ startDate: '2026-08-01', endDate: '2026-08-31' }), {
    start: '2026-07-31T22:00:00.000Z',
    endExclusive: '2026-08-31T22:00:00.000Z',
  });
  // 21:59:59Z is still July SAST, while 22:00:00Z is the first August record.
  assert.equal(new Date('2026-07-31T21:59:59.999Z') < new Date('2026-07-31T22:00:00.000Z'), true);
  assert.equal(new Date('2026-08-31T22:00:00.000Z') < new Date('2026-08-31T22:00:00.000Z'), false);
});

test('monthly operations report email escapes business-controlled content', () => {
  const html = renderMonthlyReportEmail({
    period: { label: '<img src=x onerror=alert(1)>', startDate: '2026-08-01', endDate: '2026-08-31', complete: true },
    report: buildMonthlyReport({
      period: { startDate: '2026-08-01', endDate: '2026-08-31', complete: true },
      business: { leadCount: 0, convertedLeadCount: 0 },
      searchCache: null,
      hosting: { status: 'not_measured', explanation: '<script>alert(1)</script>', invoiceReady: false },
    }),
  }).html;

  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('&lt;img src=x onerror=alert(1)&gt;'), true);
  assert.equal(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
});

test('admin preview requires an admin session', async () => {
  const handler = createHandler({ verifyAdminToken: async () => false, getSql: () => async () => [] });
  const response = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: {} });

  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers.Pragma, 'no-cache');
  assert.deepEqual(JSON.parse(response.body), { error: 'Unauthorized' });
});

test('admin preview does not expose a recipient and recognises only the approved internal mailbox as configured', async () => {
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => monthlySql(),
    env: { MONTHLY_REPORT_RECIPIENTS: ' ACCOUNTS@LABRONIX.CO.ZA, info@navrik.com.au ' },
    now: () => new Date('2026-08-24T04:00:00.000Z'),
  });
  const response = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: {} });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.delivery.recipientConfigured, true);
  assert.equal(Object.hasOwn(body.delivery, 'recipient'), false);
});

test('admin send fails closed when email configuration is missing', async () => {
  let mailCalls = 0;
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => async () => [],
    env: { NETLIFY_DATABASE_URL: 'test' },
    sendEmail: async () => { mailCalls += 1; },
    now: () => new Date('2026-08-24T04:00:00.000Z'),
  });
  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ action: 'send_current' }), queryStringParameters: {} });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(JSON.parse(response.body), {
    status: 'setup_required',
    explanation: 'Monthly internal report delivery is not configured yet.',
    missingConfiguration: ['EMAIL_API_KEY', 'MONTHLY_REPORT_RECIPIENTS'],
  });
  assert.equal(mailCalls, 0);
});

test('monthly delivery refuses a configured recipient other than the approved accounts mailbox', async () => {
  const result = await deliverMonthlyReport({
    sql: monthlySql(),
    period: { startDate: '2026-08-01', endDate: '2026-08-31', complete: true, label: 'August 2026' },
    env: { EMAIL_API_KEY: 'test-key', MONTHLY_REPORT_RECIPIENTS: ' Accounts@Other.example, info@navrik.com.au ' },
  });

  assert.deepEqual(result, { status: 'setup_required', missingConfiguration: ['MONTHLY_REPORT_RECIPIENTS'] });
});

test('monthly delivery requires exactly the two approved internal recipients and sends separately to each', async () => {
  const deliveries = [];
  const result = await deliverMonthlyReport({
    sql: monthlySql(),
    period: { startDate: '2026-08-01', endDate: '2026-08-31', complete: true, label: 'August 2026' },
    env: { EMAIL_API_KEY: 'test-key', MONTHLY_REPORT_RECIPIENTS: 'info@navrik.com.au, accounts@labronix.co.za' },
    sendEmail: async (message) => { deliveries.push(message.to); return { id: `email_${deliveries.length}` }; },
  });

  assert.equal(result.status, 'sent');
  assert.deepEqual(deliveries.sort(), ['accounts@labronix.co.za', 'info@navrik.com.au']);
});

test('admin completed-month send delivers the operations report only to the configured internal recipient', async () => {
  let email;
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => monthlySql(),
    env: { EMAIL_API_KEY: 'test-key', MONTHLY_REPORT_RECIPIENTS: 'accounts@labronix.co.za,info@navrik.com.au' },
    now: () => new Date('2026-08-24T04:00:00.000Z'),
    sendEmail: async (message) => { email = message; return { id: 'email_123' }; },
  });

  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ action: 'send_current' }), queryStringParameters: {} });

  assert.equal(response.statusCode, 202);
  assert.equal(JSON.parse(response.body).status, 'sent');
  assert.equal(email.to, 'info@navrik.com.au');
  assert.equal(email.subject, 'Navrik monthly operations report — July 2026');
  assert.equal(email.html.includes('Orders received'), false);
  assert.equal(email.html.includes('invoice'), false);
});

test('monthly delivery does not send again after its period and recipient were recorded as sent', async () => {
  let mailCalls = 0;
  const result = await deliverMonthlyReport({
    sql: monthlySql({ delivery: { send_state: 'sent', sent_at: '2026-08-31T04:00:00.000Z' } }),
    period: { startDate: '2026-08-01', endDate: '2026-08-31', complete: true, label: 'August 2026' },
    env: { EMAIL_API_KEY: 'test-key', MONTHLY_REPORT_RECIPIENTS: 'accounts@labronix.co.za,info@navrik.com.au' },
    sendEmail: async () => { mailCalls += 1; },
  });

  assert.equal(result.status, 'already_sent');
  assert.equal(mailCalls, 0);
});

test('monthly delivery fails closed instead of sending a duplicate while an existing delivery is in progress', async () => {
  let mailCalls = 0;
  const result = await deliverMonthlyReport({
    sql: monthlySql({ delivery: { send_state: 'sending', sent_at: null } }),
    period: { startDate: '2026-08-01', endDate: '2026-08-31', complete: true, label: 'August 2026' },
    env: { EMAIL_API_KEY: 'test-key', MONTHLY_REPORT_RECIPIENTS: 'accounts@labronix.co.za,info@navrik.com.au' },
    sendEmail: async () => { mailCalls += 1; },
  });

  assert.equal(result.status, 'in_progress');
  assert.equal(mailCalls, 0);
});

test('monthly delivery reclaims a stale crash lease and retains the deterministic provider key', async () => {
  let email;
  const result = await deliverMonthlyReport({
    sql: monthlySql({ delivery: { send_state: 'sending', sent_at: null }, claim: { send_state: 'sending', attempt_started_at: '2026-09-01T04:00:00.000Z' } }),
    period: { startDate: '2026-08-01', endDate: '2026-08-31', complete: true, label: 'August 2026' },
    env: { EMAIL_API_KEY: 'test-key', MONTHLY_REPORT_RECIPIENTS: 'ACCOUNTS@LABRONIX.CO.ZA,info@navrik.com.au' },
    sendEmail: async (message) => { email = message; return { id: 'email_456' }; },
  });

  assert.equal(result.status, 'sent');
  assert.equal(email.to, 'info@navrik.com.au');
  assert.match(email.idempotencyKey, /^[a-f0-9]{64}$/);
});
