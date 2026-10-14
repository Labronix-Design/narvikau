import assert from 'node:assert/strict';
import test from 'node:test';
import { createContactEmailHandler } from '../../netlify/functions/contact-email.js';

const lead = { Name: 'Avery', Surname: 'Company', Phone: '+61 412 345 678', Email: 'avery@example.test', Message: 'Hello', LocationState: 'Victoria', LocationSuburb: '<b>Melbourne</b>', DiscoverySource: 'Referral', DiscoverySourceDetail: '<img src=x>' };

test('contact atomically stores trusted general contact details before escaped AU emails', async () => {
  const queries = []; const sent = [];
  const sql = async (strings, ...values) => { queries.push({ query: strings.join('?'), values }); return [{ id: 1 }]; };
  const handler = createContactEmailHandler({ getSql: () => sql, rateLimiter: { check: async () => true }, sendEmail: async message => {
    assert.ok(queries.some(({query}) => query.includes('INSERT INTO leads'))); sent.push(message);
  } });
  assert.equal((await handler({ httpMethod: 'POST', body: JSON.stringify(lead) })).statusCode, 200);
  const insert = queries.find(({query}) => query.includes('INSERT INTO leads'));
  assert.match(insert.query, /WITH customer AS/);
  assert.match(insert.query, /INSERT INTO customers/);
  assert.match(insert.query, /enquiry_type, location_state, location_suburb, discovery_source, discovery_source_detail/);
  assert.ok(insert.values.includes('general_contact')); assert.ok(insert.values.includes('contact_form'));
  for (const value of ['Victoria', '<b>Melbourne</b>', 'Referral', '<img src=x>']) assert.ok(insert.values.includes(value));
  assert.equal(sent.length, 2); assert.equal(sent[0].to, 'info@navrik.com.au'); assert.equal(sent[1].to, lead.Email);
  for (const message of sent) {
    assert.equal(message.from, 'Navrik <info@navrik.com.au>');
    assert.match(message.html, /&lt;b&gt;Melbourne&lt;\/b&gt;/); assert.match(message.html, /&lt;img src=x&gt;/);
    assert.match(message.html, /General contact/); assert.doesNotMatch(message.html, /<img src=x>|navrik\.co\.za/);
  }
});

test('contact blocks delivery after failed durable storage and guards methods', async () => {
  let sent = false;
  const handler = createContactEmailHandler({ getSql: () => async () => { throw new Error('private SQL failure'); }, rateLimiter: { check: async () => true }, sendEmail: async () => { sent = true; } });
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify(lead) });
  assert.equal(response.statusCode, 503); assert.equal(sent, false); assert.doesNotMatch(response.body, /private SQL/);
  assert.equal((await handler({httpMethod:'GET'})).statusCode, 405);
});
