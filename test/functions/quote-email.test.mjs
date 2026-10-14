import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuoteEmailHandler } from '../../netlify/functions/quote-email.js';

const lead = { Name: 'Avery', Phone: '+61 412 345 678', Email: 'avery@example.test', Message: 'Please quote', Product: 'Canopy', Type: 'Product Quote Request', LocationState: 'Queensland', LocationSuburb: '<b>Brisbane</b>', DiscoverySource: 'Other', DiscoverySourceDetail: '<img src=x>' };
test('quote accepts the corrected type and atomically records structured details before escaped AU emails', async () => {
  const queries = []; const sent = [];
  const sql = async (strings, ...values) => { queries.push({query:strings.join('?'), values}); return [{id:2}]; };
  const handler = createQuoteEmailHandler({getSql:()=>sql, rateLimiter:{check:async()=>true}, sendEmail:async message=>{ assert.ok(queries.some(({query})=>query.includes('INSERT INTO leads'))); sent.push(message); }});
  assert.equal((await handler({httpMethod:'POST',body:JSON.stringify(lead)})).statusCode,200);
  const insert = queries.find(({query})=>query.includes('INSERT INTO leads'));
  assert.match(insert.query,/WITH customer AS/); assert.match(insert.query,/enquiry_type, location_state, location_suburb, discovery_source, discovery_source_detail/);
  assert.ok(insert.values.includes('product_quote'));
  for(const value of ['Queensland','<b>Brisbane</b>','Other','<img src=x>']) assert.ok(insert.values.includes(value));
  assert.equal(sent.length,2); assert.equal(sent[0].to,'info@navrik.com.au'); assert.equal(sent[1].to,lead.Email);
  for(const message of sent) { assert.match(message.html,/&lt;b&gt;Brisbane&lt;\/b&gt;/); assert.match(message.html,/&lt;img src=x&gt;/); assert.equal(message.from,'Navrik <info@navrik.com.au>'); }
  for(const fields of [{Type:'Canopy Quote Request'},{source:'manual'},{enquiry_type:'dealer_enquiry'}]) assert.equal((await handler({httpMethod:'POST',body:JSON.stringify({...lead,...fields})})).statusCode,400);
});
