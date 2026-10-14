import assert from 'node:assert/strict';
import test from 'node:test';

const payload = {Name:'Avery',BusinessName:'<b>Fitters</b>',Phone:'+61 412 345 678',Email:'avery@example.test',Message:'Join us',EnquiryType:'dealer_enquiry',LocationState:'Western Australia',LocationSuburb:'Perth',DiscoverySource:'Referral',DiscoverySourceDetail:'<img src=x>'};
const module = await import('../../netlify/functions/partner-email.js').catch(()=>({}));
test('partner endpoint exists and accepts only validated dealer or fitment selections with trusted source', async () => {
  assert.equal(typeof module.createPartnerEmailHandler,'function');
  for(const EnquiryType of ['dealer_enquiry','fitment_enquiry']) {
    const queries=[]; const sent=[]; let source;
    const handler=module.createPartnerEmailHandler({getSql:()=>async(strings,...values)=>{ queries.push({query:strings.join('?'),values}); return [{id:3}];},rateLimiter:{check:async value=>{source=value.source;return true;}},sendEmail:async message=>{assert.ok(queries.some(({query})=>query.includes('INSERT INTO leads')));sent.push(message);}});
    assert.equal((await handler({httpMethod:'POST',body:JSON.stringify({...payload,EnquiryType})})).statusCode,200);
    assert.equal(source,'partner_form'); const insert=queries.find(({query})=>query.includes('INSERT INTO leads'));
    assert.ok(insert.values.includes('partner_form')); assert.ok(insert.values.includes(EnquiryType)); assert.ok(insert.values.includes('<b>Fitters</b>'));
    assert.equal(sent[0].to,'info@navrik.com.au'); assert.equal(sent[1].to,payload.Email);
    for(const message of sent){assert.match(message.html,/&lt;b&gt;Fitters&lt;\/b&gt;/);assert.match(message.html,/&lt;img src=x&gt;/);}
  }
});
test('partner rejects forged types, missing business and fields before touching services',async()=>{
  assert.equal(typeof module.createPartnerEmailHandler,'function'); let touched=false;
  const handler=module.createPartnerEmailHandler({getSql:()=>{touched=true;throw new Error('unexpected');},rateLimiter:{check:async()=>{touched=true;return true;}}});
  for(const fields of [{EnquiryType:'general_contact'},{EnquiryType:'product_quote'},{EnquiryType:''},{BusinessName:' '},{source:'manual'},{enquiry_type:'fitment_enquiry'},{Surname:'Unknown'},{LocationState:'Gauteng'}]) assert.equal((await handler({httpMethod:'POST',body:JSON.stringify({...payload,...fields})})).statusCode,400);
  assert.equal(touched,false); assert.equal((await handler({httpMethod:'GET'})).statusCode,405);
});
test('partner handles exhausted limits and persistence failure without email',async()=>{
  assert.equal(typeof module.createPartnerEmailHandler,'function'); let sent=false;
  for(const allowed of [false,true]) {
    const handler=module.createPartnerEmailHandler({getSql:()=>async()=>{throw new Error('unavailable');},rateLimiter:{check:async()=>allowed},sendEmail:async()=>{sent=true;}});
    assert.equal((await handler({httpMethod:'POST',body:JSON.stringify(payload)})).statusCode,allowed?503:429);
  }
  assert.equal(sent,false);
});
