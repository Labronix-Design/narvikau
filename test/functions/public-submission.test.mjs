import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContactEmailHtml, createContactEmailHandler } from '../../netlify/functions/contact-email.js';
import { buildQuoteEmailHtml, createQuoteEmailHandler } from '../../netlify/functions/quote-email.js';
import { createSubmissionRateLimiter, submissionRateKeys, validatePublicLead } from '../../netlify/functions/_public-submission.js';

const details = { LocationState: 'New South Wales', LocationSuburb: 'Sydney', DiscoverySource: 'Google Search', DiscoverySourceDetail: '' };

const maliciousLead = {
  ...details,
  Name: '<img src=x onerror=alert(1)>',
  Surname: 'Dealer',
  Phone: '+27 82 123 4567',
  Email: 'customer@example.test',
  Message: '<img src=x onerror=alert(1)>',
  Product: '<img src=x onerror=alert(1)>',
};
const maliciousContact = Object.fromEntries(Object.entries(maliciousLead).filter(([key]) => key !== 'Product'));

const validQuote = {
  ...details,
  Name: 'Avery Customer',
  Phone: '+61 412 345 678',
  Email: 'avery@example.test',
  Message: 'Please quote this canopy.',
  Product: 'Navrik Canopy Adventure',
  Type: 'Product Quote Request',
};

test('public leads validate all Australian states and normal Navrik referral choices', () => {
  for (const LocationState of ['Australian Capital Territory', 'New South Wales', 'Northern Territory', 'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia']) {
    assert.equal(validatePublicLead({ ...maliciousContact, LocationState }).LocationState, LocationState);
  }
  for (const DiscoverySource of ['Google Search', 'Other Web Search', 'Facebook', 'Instagram', 'ChatGPT', 'Claude', 'Gemini', 'Other AI Platform', 'Referral', 'Other']) {
    const DiscoverySourceDetail = ['Other AI Platform', 'Referral', 'Other'].includes(DiscoverySource) ? 'A customer' : '';
    assert.equal(validatePublicLead({ ...maliciousContact, DiscoverySource, DiscoverySourceDetail }).DiscoverySource, DiscoverySource);
  }
});

test('public leads reject forged attribution and invalid or excessive location/referral values', () => {
  for (const fields of [
    { source: 'manual' }, { enquiry_type: 'dealer_enquiry' }, { EnquiryType: 'dealer_enquiry' },
    { LocationState: 'Gauteng' }, { LocationState: '' }, { LocationSuburb: ' ' },
    { LocationSuburb: 'a'.repeat(161) }, { LocationSuburb: 'Sydney\u0000' },
    { DiscoverySource: 'Unknown' }, { DiscoverySource: 'Referral' },
    { DiscoverySource: 'Other AI Platform' }, { DiscoverySource: 'Other' },
    { DiscoverySourceDetail: 'unexpected' }, { DiscoverySource: 'Referral', DiscoverySourceDetail: 'a'.repeat(121) },
  ]) assert.throws(() => validatePublicLead({ ...maliciousContact, ...fields }), undefined, JSON.stringify(fields));
});

test('contact and quote emails escape untrusted HTML in text and attribute contexts', () => {
  const contact = buildContactEmailHtml(maliciousLead);
  const quote = buildQuoteEmailHtml(maliciousLead);

  for (const html of [contact.internalHtml, contact.clientHtml, quote.internalHtml, quote.clientHtml]) {
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  }
});

test('contact rejects a malformed email before persistence or email delivery', async () => {
  let persisted = false;
  let delivered = false;
  const handler = createContactEmailHandler({
    getSql: () => { persisted = true; throw new Error('must not access database'); },
    sendEmail: async () => { delivered = true; },
    rateLimiter: { check: async () => true },
  });

  const response = await handler({
    httpMethod: 'POST', headers: {},
    body: JSON.stringify({ ...maliciousContact, Email: 'not-an-email' }),
  });

  assert.equal(response.statusCode, 400);
  assert.equal(persisted, false);
  assert.equal(delivered, false);
});

test('contact returns 429 without persistence or email after the server-side rate limit is exhausted', async () => {
  let persisted = false;
  let delivered = false;
  const handler = createContactEmailHandler({
    getSql: () => { persisted = true; throw new Error('must not access database'); },
    sendEmail: async () => { delivered = true; },
    rateLimiter: { check: async () => false },
  });

  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(maliciousContact) });

  assert.equal(response.statusCode, 429);
  assert.equal(persisted, false);
  assert.equal(delivered, false);
});

test('contact sends only Australian identity after durable persistence', async () => {
  const sent = [];
  const sql = async (strings) => strings.join('').includes('RETURNING id') ? [{ id: 18 }] : [];
  const handler = createContactEmailHandler({
    getSql: () => sql,
    rateLimiter: { check: async () => true },
    sendEmail: async (message) => { sent.push(message); return { ok: true }; },
  });

  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(maliciousContact) });

  assert.equal(response.statusCode, 200);
  assert.equal(sent[0].from, 'Navrik <info@navrik.com.au>');
  assert.equal(sent[0].to, 'info@navrik.com.au');
  assert.match(sent[1].html, /navrik\.com\.au/);
  assert.doesNotMatch(sent.map((message) => message.html).join('\n'), /navrik\.co\.za|Built Tough for Africa/);
});

test('contact rejects unknown fields before rate limiting or persistence', async () => {
  let rateLimited = false;
  let databaseAccessed = false;
  const handler = createContactEmailHandler({
    getSql: () => { databaseAccessed = true; throw new Error('must not access database'); },
    rateLimiter: { check: async () => { rateLimited = true; return true; } },
  });

  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ ...maliciousContact, internal: true }) });

  assert.equal(response.statusCode, 400);
  assert.equal(rateLimited, false);
  assert.equal(databaseAccessed, false);
});

test('quote accepts a product request, rate-limits it in the product bucket, and sends only Australian identity', async () => {
  const sent = [];
  let rateLimitSource;
  let persistedSource;
  const sql = async (strings) => {
    const query = strings.join('');
    if (query.includes('INSERT INTO leads')) persistedSource = query.match(/SELECT '([^']+)'/)[1];
    return query.includes('RETURNING id') ? [{ id: 17 }] : [];
  };
  const handler = createQuoteEmailHandler({
    getSql: () => sql,
    rateLimiter: { check: async ({ source }) => {
      rateLimitSource = source;
      return source === 'product_quote';
    } },
    sendEmail: async (message) => { sent.push(message); return { ok: true }; },
  });

  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(validQuote) });

  assert.equal(response.statusCode, 200);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].from, 'Navrik <info@navrik.com.au>');
  assert.equal(sent[0].to, 'info@navrik.com.au');
  assert.equal(sent[1].to, validQuote.Email);
  assert.equal(sent[0].subject, 'Product Quote Request: Navrik Canopy Adventure — Avery Customer');
  assert.equal(sent[1].subject, 'Product quote request received — Navrik Canopy Adventure | Navrik');
  assert.equal(rateLimitSource, 'product_quote');
  assert.equal(persistedSource, 'product_quote');
  assert.match(sent[1].html, /navrik\.com\.au/);
  assert.doesNotMatch(sent.map((message) => message.html).join('\n'), /navrik\.co\.za|Built Tough for Africa/);
});

test('quote rejects malformed and retired canopy payloads before persistence and delivery', async () => {
  let databaseAccessed = false;
  let delivered = false;
  const handler = createQuoteEmailHandler({
    getSql: () => { databaseAccessed = true; throw new Error('must not access database'); },
    rateLimiter: { check: async () => true },
    sendEmail: async () => { delivered = true; },
  });

  for (const payload of [
    { ...validQuote, Email: 'invalid' },
    { ...validQuote, Type: 'Canopy Quote Request' },
    { ...validQuote, Type: 'Accessory Quote Request' },
    { ...validQuote, Price: 1 },
    { ...validQuote, unexpected: true },
  ]) {
    const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(payload) });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(databaseAccessed, false);
  assert.equal(delivered, false);
});

test('quote returns 429 without persistence or delivery when the product quote limit is exhausted', async () => {
  let databaseAccessed = false;
  let delivered = false;
  const handler = createQuoteEmailHandler({
    getSql: () => { databaseAccessed = true; throw new Error('must not access database'); },
    rateLimiter: { check: async () => false },
    sendEmail: async () => { delivered = true; },
  });

  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(validQuote) });

  assert.equal(response.statusCode, 429);
  assert.equal(databaseAccessed, false);
  assert.equal(delivered, false);
});

test('quote email uses generic product quote copy while escaping untrusted values', () => {
  const quote = buildQuoteEmailHtml({ ...maliciousLead, Type: 'Product Quote Request' });
  const combinedHtml = `${quote.internalHtml}\n${quote.clientHtml}`;

  assert.match(quote.internalHtml, /Product Quote Request/);
  assert.match(quote.clientHtml, /product quote request/);
  assert.doesNotMatch(combinedHtml, /[Cc]anopy quote request/);
  assert.match(combinedHtml, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(combinedHtml, /<img src=x onerror=alert\(1\)>/);
});

test('quote does not send email when persistence fails', async () => {
  let delivered = false;
  const handler = createQuoteEmailHandler({
    getSql: () => async (strings) => strings.join('').includes('RETURNING id') ? [] : [],
    rateLimiter: { check: async () => true },
    sendEmail: async () => { delivered = true; },
  });

  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(validQuote) });

  assert.equal(response.statusCode, 503);
  assert.equal(delivered, false);
});

test('public handlers wait for both email attempts before reporting a delivery failure', async () => {
  for (const [factory, payload] of [[createContactEmailHandler, maliciousContact], [createQuoteEmailHandler, validQuote]]) {
    let finishSecond;
    let returned = false;
    let deliveries = 0;
    const handler = factory({
      getSql: () => async () => [{ id: 7 }],
      rateLimiter: { check: async () => true },
      sendEmail: async () => {
        deliveries += 1;
        if (deliveries === 1) throw new Error('delivery unavailable');
        await new Promise(resolve => { finishSecond = resolve; });
      },
    });
    const pending = handler({ httpMethod: 'POST', body: JSON.stringify(payload) }).then(response => { returned = true; return response; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof finishSecond, 'function');
    const returnedEarly = returned;
    finishSecond();
    const response = await pending;
    assert.equal(returnedEarly, false, 'A Netlify response must not leave the second delivery running');
    assert.equal(response.statusCode, 502);
  }
});

test('the submission rate limiter uses the migrated table without runtime schema changes', async () => {
  const queries = [];
  const sql = async (strings) => {
    queries.push(strings.join('?'));
    return queries.length === 2 ? [{ attempts: 6 }] : [];
  };
  const limiter = createSubmissionRateLimiter(sql);

  assert.equal(await limiter.check({ event: { headers: { 'x-nf-client-connection-ip': '198.51.100.24' } }, source: 'contact_form', email: 'customer@example.test' }), false);
  assert.equal(queries.some((query) => /CREATE|ALTER/i.test(query)), false);
});

test('varied emails from one trusted platform IP cannot evade the IP submission limit', async () => {
  const event = { headers: { 'x-nf-client-connection-ip': '198.51.100.24' } };
  const first = submissionRateKeys(event, 'contact_form', 'first@example.test');
  const second = submissionRateKeys(event, 'contact_form', 'second@example.test');
  const consumed = [];
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    if (!query.includes('INSERT')) return [];
    consumed.push(values[0]);
    return [{ attempts: values[0] === first.ipKey ? 6 : 1 }];
  };
  const limiter = createSubmissionRateLimiter(sql);

  assert.equal(await limiter.check({ event, source: 'contact_form', email: 'first@example.test' }), false);
  assert.equal(await limiter.check({ event, source: 'contact_form', email: 'second@example.test' }), false);
  assert.equal(first.ipKey, second.ipKey);
  assert.notEqual(first.emailKey, second.emailKey);
  assert.equal(consumed.filter((key) => key === first.ipKey).length, 2);
});

test('proxy and client-supplied address headers are not accepted as rate-limit identity', () => {
  const withFirstSpoof = submissionRateKeys({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'client-ip': '198.18.0.1' } }, 'contact_form', 'customer@example.test');
  const withSecondSpoof = submissionRateKeys({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'client-ip': '192.0.2.99' } }, 'contact_form', 'customer@example.test');

  assert.equal(withFirstSpoof, null);
  assert.equal(withSecondSpoof, null);
});

test('missing Netlify connection IP denies submissions despite spoofed XFF before database or delivery', async () => {
  let databaseCalls = 0;
  let persisted = false;
  let delivered = false;
  const sql = async () => { databaseCalls += 1; return []; };
  const handler = createContactEmailHandler({
    getSql: () => sql,
    sendEmail: async () => { delivered = true; },
  });
  const response = await handler({
    httpMethod: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.7', 'client-ip': '192.0.2.99' },
    body: JSON.stringify(maliciousContact),
  });

  assert.equal(response.statusCode, 503);
  assert.equal(databaseCalls, 0);
  assert.equal(persisted, false);
  assert.equal(delivered, false);
});
