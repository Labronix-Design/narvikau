import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createYocoStore, createYocoWebhookHandler, readAuthoritativePaymentAmountCents } from '../../netlify/functions/yoco-webhook.js';
import { hashSecret } from '../../netlify/functions/_security.js';

const secret = 'webhook-test-secret';
const nowSeconds = 1_700_000_000;

function signedEvent(rawBody, { id = 'evt_123', timestamp = String(nowSeconds), signature = null } = {}) {
  const payload = `${id}.${timestamp}.${rawBody}`;
  const validSignature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
  return { httpMethod: 'POST', body: rawBody, headers: { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature ?? `v1,${validSignature}` } };
}

function config() { return { webhookSecret: secret, databaseUrl: 'postgres://test', resendApiKey: '' }; }
function paymentBody() { return JSON.stringify({ type: 'payment.succeeded', payload: { id: 'pay_123', amount: 5000, metadata: { internalOrderId: '27', customerEmail: 'customer@example.test', customerName: 'Customer' } } }); }
function pendingPayment(overrides = {}) {
  return {
    checkoutId: 'pay_123',
    amountCents: 5000,
    status: 'pending',
    paymentId: null,
    paidAmountCents: null,
    ...overrides,
  };
}

test('uses the persisted cent amount only and never falls back to legacy decimal order totals', () => {
  assert.equal(readAuthoritativePaymentAmountCents({ payment_amount_cents: 5000, total_incl_vat: '999.99', deposit_amount_cents: 100 }), 5000);
  assert.equal(readAuthoritativePaymentAmountCents({ total_incl_vat: '50.00', deposit_amount_cents: 5000 }), null);
  assert.equal(readAuthoritativePaymentAmountCents({ payment_amount_cents: '5000' }), null);
});

test('webhook storage reads and compares the cent payment authority, not legacy order decimals', async () => {
  const queries = [];
  const sql = async (strings) => {
    queries.push(strings.join(' '));
    return [{ yoco_checkout_id: 'pay_123', payment_amount_cents: 5000, status: 'pending', yoco_payment_id: null, deposit_paid_amount_cents: null }];
  };
  const store = createYocoStore('', { sql });

  assert.deepEqual(await store.getExpectedPayment(27), pendingPayment());
  await store.markDepositPaid(27, 'pay_123', 5000);
  await store.markFailed(28, 'pay_456', 6200);

  for (const query of queries) {
    assert.match(query, /payment_amount_cents/);
    assert.doesNotMatch(query, /total_incl_vat \* 100/);
  }
  assert.doesNotMatch(queries[0], /status = 'pending'/);
  assert.match(queries[1], /state = 'committed'/);
  assert.match(queries[2], /state = 'released'/);
  assert.match(queries[2], /current_uses = GREATEST/);
  assert.match(queries[2], /released_at = NOW/);
});

test('rejects an unsigned webhook before it can reach payment storage', async () => {
  let storageCreated = false;
  const handler = createYocoWebhookHandler({ getConfig: config, now: () => new Date(nowSeconds * 1000), storeFactory: () => { storageCreated = true; throw new Error('must not reach database'); } });
  const response = await handler({ httpMethod: 'POST', body: paymentBody(), headers: {} });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body, 'Unauthorized');
  assert.equal(storageCreated, false);
});

test('rejects a correctly signed webhook outside the replay window before parsing it', async () => {
  let storageCreated = false;
  const handler = createYocoWebhookHandler({ getConfig: config, now: () => new Date(nowSeconds * 1000), storeFactory: () => { storageCreated = true; throw new Error('must not reach database'); } });
  const response = await handler(signedEvent('{not valid json', { timestamp: String(nowSeconds - 301) }));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body, 'Unauthorized');
  assert.equal(storageCreated, false);
});

test('processes a valid signed payment once and avoids duplicate fulfilment email', async () => {
  let auditLogged = false; let emailsSent = 0; let businessCacheInvalidated = false; const purgeCalls = [];
  const store = { getExpectedPayment: async () => pendingPayment(), markDepositPaid: async () => true, confirmPromoSlot: async () => {}, writeAudit: async () => { auditLogged = true; }, invalidateBusinessCache: async () => { businessCacheInvalidated = true; }, markFailed: async () => false };
  const handler = createYocoWebhookHandler({ getConfig: config, now: () => new Date(nowSeconds * 1000), storeFactory: () => store, sendEmail: async () => { emailsSent += 1; }, purgeTags: async (...args) => { purgeCalls.push(args); } });
  const context = { clientContext: { custom: { purge_api_token: 'lambda-secret' } } };
  const response = await handler(signedEvent(paymentBody()), context);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'OK');
  // The audit is now persisted atomically inside the paid-order write, rather
  // than as a second, retry-fragile write after the payment state changed.
  assert.equal(auditLogged, false);
  assert.equal(emailsSent, 2);
  assert.equal(businessCacheInvalidated, true);
  assert.deepEqual(purgeCalls, [[['promo-status']]]);
});

test('the default paid-webhook path passes the Lambda purge token to the official Netlify purge helper', async () => {
  const previousFetch = globalThis.fetch;
  const previousSiteId = process.env.SITE_ID;
  const previousPurgeToken = process.env.NETLIFY_PURGE_API_TOKEN;
  const previousLocal = process.env.NETLIFY_LOCAL;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  process.env.SITE_ID = 'site-test';
  delete process.env.NETLIFY_PURGE_API_TOKEN;
  delete process.env.NETLIFY_LOCAL;

  try {
    const store = {
      getExpectedPayment: async () => pendingPayment(),
      markDepositPaid: async () => true,
      invalidateBusinessCache: async () => {},
      markFailed: async () => false,
    };
    const handler = createYocoWebhookHandler({
      getConfig: config,
      now: () => new Date(nowSeconds * 1000),
      storeFactory: () => store,
    });
    const context = { clientContext: { custom: { purge_api_token: 'lambda-secret' } } };

    const response = await handler(signedEvent(paymentBody()), context);

    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.headers.Authorization, 'Bearer lambda-secret');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      cache_tags: ['promo-status'],
      site_id: 'site-test',
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSiteId === undefined) delete process.env.SITE_ID;
    else process.env.SITE_ID = previousSiteId;
    if (previousPurgeToken === undefined) delete process.env.NETLIFY_PURGE_API_TOKEN;
    else process.env.NETLIFY_PURGE_API_TOKEN = previousPurgeToken;
    if (previousLocal === undefined) delete process.env.NETLIFY_LOCAL;
    else process.env.NETLIFY_LOCAL = previousLocal;
  }
});

test('a paid order remains successful when its promo status edge purge fails', async () => {
  const store = {
    getExpectedPayment: async () => pendingPayment(),
    markDepositPaid: async () => true,
    invalidateBusinessCache: async () => {},
    writeAudit: async () => {},
    markFailed: async () => false,
  };
  const handler = createYocoWebhookHandler({
    getConfig: config,
    now: () => new Date(nowSeconds * 1000),
    storeFactory: () => store,
    purgeTags: async () => { throw new Error('edge unavailable'); },
  });

  const response = await handler(signedEvent(paymentBody()));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'OK');
});

test('paid order confirmation persists only a hash and sends the single-use warranty URL to the customer', async () => {
  const issuedToken = 'A3OdzYqA96uQYVY8vD04XPf88VNz0-bmJVrhkAjm0A4';
  let storedTokenHash = '';
  const delivered = [];
  const store = {
    getExpectedPayment: async () => pendingPayment(),
    markDepositPaid: async () => true,
    issueWarrantyRegistrationToken: async (_orderId, tokenHash) => { storedTokenHash = tokenHash; },
    invalidateBusinessCache: async () => {},
    writeAudit: async () => {},
    markFailed: async () => false,
  };
  const handler = createYocoWebhookHandler({
    getConfig: config,
    now: () => new Date(nowSeconds * 1000),
    storeFactory: () => store,
    makeWarrantyToken: () => issuedToken,
    purgeTags: async () => {},
    sendEmail: async (to, _subject, html) => delivered.push({ to, html }),
  });

  const response = await handler(signedEvent(paymentBody()));

  assert.equal(response.statusCode, 200);
  assert.equal(storedTokenHash, hashSecret(issuedToken));
  assert.notEqual(storedTokenHash, issuedToken);
  assert.match(delivered.find((email) => email.to === 'customer@example.test').html, /register-warranty#token=A3OdzYqA96uQYVY8vD04XPf88VNz0-bmJVrhkAjm0A4/);
  assert.doesNotMatch(delivered.find((email) => email.to === 'info@navrik.co.za').html, /register-warranty/);
});

test('acknowledges a retried signed payment without a second audit or email', async () => {
  let auditLogged = false; let emailsSent = 0; const purged = [];
  const handler = createYocoWebhookHandler({ getConfig: config, now: () => new Date(nowSeconds * 1000), storeFactory: () => ({ getExpectedPayment: async () => pendingPayment(), markDepositPaid: async () => false, confirmPromoSlot: async () => { throw new Error('must not confirm'); }, writeAudit: async () => { auditLogged = true; }, markFailed: async () => false }), sendEmail: async () => { emailsSent += 1; }, purgeTags: async (tags) => { purged.push(tags); } });
  const response = await handler(signedEvent(paymentBody()));
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'OK');
  assert.equal(auditLogged, false);
  assert.equal(emailsSent, 0);
  assert.deepEqual(purged, []);
});

test('an identical paid retry is acknowledged after the atomic payment-and-audit write without duplicate side effects', async () => {
  let status = 'pending';
  let markCalls = 0;
  let auditAttempts = 0;
  let businessInvalidations = 0;
  let tokenIssues = 0;
  let emailsSent = 0;
  const purged = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM orders')) {
      if (query.includes("status = 'pending'") && status !== 'pending') return [];
      return [{
        yoco_checkout_id: 'pay_123',
        payment_amount_cents: 5000,
        status,
        yoco_payment_id: status === 'deposit_paid' ? 'pay_123' : null,
        deposit_paid_amount_cents: status === 'deposit_paid' ? 5000 : null,
      }];
    }
    if (query.includes('WITH paid_order')) {
      markCalls += 1;
      if (query.includes('INSERT INTO order_audit_log')) auditAttempts += 1;
      status = 'deposit_paid';
      return [{ id: 27 }];
    }
    return [];
  };
  const store = createYocoStore('', { sql });
  store.invalidateBusinessCache = async () => { businessInvalidations += 1; };
  store.issueWarrantyRegistrationToken = async () => { tokenIssues += 1; };
  const handler = createYocoWebhookHandler({
    getConfig: config,
    now: () => new Date(nowSeconds * 1000),
    storeFactory: () => store,
    purgeTags: async (tags) => { purged.push(tags); },
    sendEmail: async () => { emailsSent += 1; },
  });

  const firstResponse = await handler(signedEvent(paymentBody()));
  const retryResponse = await handler(signedEvent(paymentBody()));

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(retryResponse.statusCode, 200);
  assert.equal(retryResponse.body, 'OK');
  assert.equal(markCalls, 1);
  assert.equal(auditAttempts, 1);
  assert.equal(businessInvalidations, 1);
  assert.equal(tokenIssues, 1);
  assert.equal(emailsSent, 2);
  assert.deepEqual(purged, [['promo-status']]);
});

test('rejects an order identifier with trailing non-numeric input', async () => {
  const rawBody = JSON.stringify({ type: 'payment.succeeded', payload: { id: 'pay_123', amount: 5000, metadata: { internalOrderId: '27unexpected' } } });
  const handler = createYocoWebhookHandler({
    getConfig: config,
    now: () => new Date(nowSeconds * 1000),
    storeFactory: () => { throw new Error('must not reach database'); },
  });

  const response = await handler(signedEvent(rawBody));

  assert.equal(response.statusCode, 400);
  assert.equal(response.body, 'Malformed webhook payload');
});

test('rejects a signed payment when its amount does not match the stored order expectation', async () => {
  const handler = createYocoWebhookHandler({
    getConfig: config,
    now: () => new Date(nowSeconds * 1000),
    storeFactory: () => ({
      getExpectedPayment: async () => pendingPayment({ amountCents: 9900 }),
      markDepositPaid: async () => { throw new Error('must not mutate an underpayment'); },
      confirmPromoSlot: async () => { throw new Error('must not confirm'); },
      writeAudit: async () => { throw new Error('must not audit'); },
      markFailed: async () => false,
    }),
  });

  const response = await handler(signedEvent(paymentBody()));

  assert.equal(response.statusCode, 409);
  assert.equal(response.body, 'Payment details do not match order');
});

test('rejects a signed payment when its checkout identifier does not match the stored order', async () => {
  const handler = createYocoWebhookHandler({
    getConfig: config,
    now: () => new Date(nowSeconds * 1000),
    storeFactory: () => ({
      getExpectedPayment: async () => pendingPayment({ checkoutId: 'ch_expected' }),
      markDepositPaid: async () => { throw new Error('must not mutate a mismatched checkout'); },
      confirmPromoSlot: async () => { throw new Error('must not confirm'); },
      writeAudit: async () => { throw new Error('must not audit'); },
      markFailed: async () => false,
    }),
  });

  const response = await handler(signedEvent(paymentBody()));

  assert.equal(response.statusCode, 409);
  assert.equal(response.body, 'Payment details do not match order');
});

test('does not mark an order failed when the signed payment is for another checkout', async () => {
  const rawBody = JSON.stringify({ type: 'payment.failed', payload: { id: 'pay_other', amount: 5000, metadata: { internalOrderId: '27' } } });
  const handler = createYocoWebhookHandler({
    getConfig: config,
    now: () => new Date(nowSeconds * 1000),
    storeFactory: () => ({
      getExpectedPayment: async () => pendingPayment(),
      markDepositPaid: async () => { throw new Error('must not pay'); },
      confirmPromoSlot: async () => { throw new Error('must not confirm'); },
      writeAudit: async () => { throw new Error('must not audit'); },
      markFailed: async () => { throw new Error('must not mutate failure state'); },
    }),
  });

  const response = await handler(signedEvent(rawBody));

  assert.equal(response.statusCode, 409);
  assert.equal(response.body, 'Payment details do not match order');
});
