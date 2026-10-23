import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHandler} from '../../netlify/functions/admin-queries.js';

const payload={name:'Avery',email:'AVERY@example.test',phone:'+61 412 345 678',company:'Fitters',message:'Please call',product:'Canopy',enquiry_type:'general_contact',location_state:'Victoria',location_suburb:'Melbourne',discovery_source:'Referral',discovery_source_detail:'Friend',status:'new',admin_notes:'Call Friday'};
const request=(method,body,queryStringParameters)=>({httpMethod:method,body:body===undefined?undefined:JSON.stringify(body),queryStringParameters});
test('workflow statuses and optional follow-up details are accepted and returned',async()=>{
 const queries=[]; const handler=createHandler({verifyAdminToken:async()=>true,getSql:()=>async(strings,...values)=>{queries.push({query:strings.join('?'),values});return [{id:4}];},invalidateSections:async()=>{}});
 for(const status of ['awaiting_customer_information','ready_to_quote','quote_sent','quote_followed_up','follow_up_later','converted','closed','new']) assert.equal((await handler(request('PUT',{id:4,status}))).statusCode,200,status);
 assert.equal((await handler(request('PUT',{id:4,status:'follow_up_later',follow_up_date:'2026-11-30',follow_up_note:'Call\r\nnext week'}))).statusCode,200);
 assert.ok(queries.at(-1).values.includes('2026-11-30')); assert.ok(queries.at(-1).values.includes('Call\nnext week'));
 assert.match(queries.at(-1).query,/RETURNING id, status, admin_notes, follow_up_date, follow_up_note/);
 assert.equal((await handler(request('POST',{...payload,status:'follow_up_later',follow_up_date:'2026-11-30',follow_up_note:'Call'}))).statusCode,201);
 for(const date of ['2026-02-30','tomorrow','2026-1-01',null]) assert.equal((await handler(request('PUT',{id:4,follow_up_date:date}))).statusCode,400);
 for(const note of [null,'x'.repeat(4001),'bad\tnote']) assert.equal((await handler(request('PUT',{id:4,follow_up_note:note}))).statusCode,400);
 assert.equal((await handler(request('PUT',{id:4,follow_up_date:'',follow_up_note:''}))).statusCode,200);
});
test('legacy quoted total is separately available from the aggregate quote total',async()=>{
 const queries=[]; const handler=createHandler({verifyAdminToken:async()=>true,getSql:()=>async(strings)=>{const query=strings.join('?'); queries.push(query); return query.includes('COUNT(*)') ? [{}] : [];}});
 assert.equal((await handler(request('GET'))).statusCode,200);
 assert.match(queries[1],/COUNT\(\*\) FILTER \(WHERE status = 'quoted'\) AS legacy_quoted/);
});
test('manual creation requires authentication before database access',async()=>{
 const handler=createHandler({verifyAdminToken:async()=>false,getSql:()=>{throw new Error('unexpected');}});
 assert.equal((await handler(request('POST',payload))).statusCode,401);
});
test('manual creation accepts each supported type with atomic parameterised storage and invalidation',async()=>{
 for(const enquiry_type of ['product_quote','general_contact','dealer_enquiry','fitment_enquiry']){
 const queries=[]; const invalidations=[];
 const handler=createHandler({verifyAdminToken:async()=>true,getSql:()=>async(strings,...values)=>{queries.push({query:strings.join('?'),values});return [{id:4,source:'manual',enquiry_type}];},invalidateSections:async(sql,sections)=>invalidations.push(sections)});
 const response=await handler(request('POST',{...payload,enquiry_type}));assert.equal(response.statusCode,201);
 assert.equal(JSON.parse(response.body).source,'manual'); assert.match(queries[0].query,/WITH customer AS/);assert.match(queries[0].query,/INSERT INTO leads/);
 assert.match(queries[0].query,/'manual'/);assert.ok(queries[0].values.includes(enquiry_type));assert.ok(queries[0].values.includes('avery@example.test'));assert.ok(queries[0].values.includes('Melbourne'));assert.ok(queries[0].values.includes('Friend'));assert.equal(invalidations.length,1);
 }
});
test('manual creation stores multiline message and notes with CRLF normalised to LF',async()=>{
 const queries=[];
 const handler=createHandler({verifyAdminToken:async()=>true,getSql:()=>async(strings,...values)=>{queries.push({query:strings.join('?'),values});return [{id:4,source:'manual'}];},invalidateSections:async()=>{}});
 const response=await handler(request('POST',{...payload,message:'First line\r\nSecond line\nThird line',admin_notes:'Call Friday\r\nSend quote'}));
 assert.equal(response.statusCode,201);
 assert.equal(queries.length,1);
 assert.ok(queries[0].values.includes('First line\nSecond line\nThird line'));
 assert.ok(queries[0].values.includes('Call Friday\nSend quote'));
 assert.ok(!queries[0].values.includes('First line\r\nSecond line\nThird line'));
});
test('manual creation rejects non-line-break controls in message and notes before SQL',async()=>{
 let calls=0;
 const handler=createHandler({verifyAdminToken:async()=>true,getSql:()=>{calls++;return async()=>[];}});
 for(const fields of [{message:'Hello\u0000world'},{message:'Hello\tworld'},{admin_notes:'Call\u007Fagain'},{admin_notes:'Call\ragain'},{message:'x'.repeat(4001)},{admin_notes:'x'.repeat(4001)},{name:'Avery\nBrown'},{location_suburb:'Mel\nbourne'}]) {
  assert.equal((await handler(request('POST',{...payload,...fields}))).statusCode,422,JSON.stringify(fields));
 }
 assert.equal(calls,0);
});
test('manual creation rejects unknown fields and invalid type/location/referral before SQL',async()=>{
 let calls=0;const handler=createHandler({verifyAdminToken:async()=>true,getSql:()=>{calls++;return async()=>[];}});
 for(const fields of [{source:'contact_form'},{id:5},{enquiry_type:'unknown'},{enquiry_type:null},{location_state:'Gauteng'},{location_suburb:''},{discovery_source_detail:''},{email:'bad'},{admin_notes:3},{status:'bogus'},{name:''},{product:'x'.repeat(161)}]) assert.equal((await handler(request('POST',{...payload,...fields}))).statusCode,422,JSON.stringify(fields));
 assert.equal((await handler({httpMethod:'POST',body:'{'})).statusCode,400);assert.equal(calls,0);
});
test('lead list filters status and enquiry type with parameterised predicates and includes structured fields',async()=>{
 const fixtures = [
   {id:1,status:'new',enquiry_type:'dealer_enquiry'},
   {id:2,status:'closed',enquiry_type:'dealer_enquiry'},
   {id:3,status:'new',enquiry_type:'general_contact'},
   {id:4,status:'new',enquiry_type:null},
 ];
 const queries=[];
 const handler=createHandler({verifyAdminToken:async()=>true,getSql:()=>async(strings,...values)=>{
   const query=strings.join('?');queries.push({query,values});
   if(query.includes('COUNT(*)')) return [{total:4}];
   // Honour each emitted filter independently: removing either predicate must
   // expose its non-matching fixture instead of a test double hiding the bug.
   const statusMatch=query.match(/\bstatus = \?/);
   const typeMatch=query.match(/\benquiry_type = \?/);
   return fixtures.filter(row=>(!statusMatch || values[1]===null || row.status===values[1])
     && (!typeMatch || values[3]===null || row.enquiry_type===values[3]));
 } });
 const response=await handler(request('GET',undefined,{status:'new',enquiry_type:'dealer_enquiry'}));
 assert.equal(response.statusCode,200);
 assert.deepEqual(JSON.parse(response.body).rows.map(row=>row.id),[1]);
 assert.match(queries[0].query,/enquiry_type, location_state, location_suburb, discovery_source, discovery_source_detail/);assert.match(queries[0].query,/WHERE/);assert.ok(queries[0].values.includes('new'));assert.ok(queries[0].values.includes('dealer_enquiry'));
 const typeOnly=await handler(request('GET',undefined,{enquiry_type:'dealer_enquiry'}));
 assert.deepEqual(JSON.parse(typeOnly.body).rows.map(row=>row.id),[1,2]);
 const statusOnly=await handler(request('GET',undefined,{status:'new'}));
 assert.deepEqual(JSON.parse(statusOnly.body).rows.map(row=>row.id),[1,3,4]);
 const unfiltered=await handler(request('GET'));
 assert.deepEqual(JSON.parse(unfiltered.body).rows.map(row=>row.id),[1,2,3,4]);
 for(const params of [{status:'bad'},{enquiry_type:'bad'},{limit:'NaN'},{offset:'-1'},{debug:'true'}]) assert.equal((await handler(request('GET',undefined,params))).statusCode,400);
});
test('lead updates protect captured details and accept only actual status/notes changes',async()=>{
 let calls=0;const handler=createHandler({verifyAdminToken:async()=>true,getSql:()=>async()=>{calls++;return [{id:4,status:'contacted'}];},invalidateSections:async()=>{}});
 for(const fields of [{enquiry_type:'dealer_enquiry'},{source:'manual'},{name:'Changed'},{location_state:'Victoria'},{}]) assert.equal((await handler(request('PUT',{id:4,...fields}))).statusCode,400);
 assert.equal(calls,0);assert.equal((await handler(request('PUT',{id:4,status:'contacted',admin_notes:'Called'}))).statusCode,200);
});
test('lead note updates normalise line breaks and reject other controls before SQL',async()=>{
 const queries=[];
 const handler=createHandler({verifyAdminToken:async()=>true,getSql:()=>async(strings,...values)=>{queries.push({query:strings.join('?'),values});return [{id:4,status:'contacted'}];},invalidateSections:async()=>{}});
 assert.equal((await handler(request('PUT',{id:4,admin_notes:'First call\r\nFollow up\nTomorrow'}))).statusCode,200);
 assert.ok(queries[0].values.includes('First call\nFollow up\nTomorrow'));
 for(const admin_notes of ['Bad\u0000note','Bad\tnote','Bad\rnote',null,'x'.repeat(4001)]) {
  assert.equal((await handler(request('PUT',{id:4,admin_notes}))).statusCode,400);
 }
 assert.equal(queries.length,1);
});
test('manual creation remains accepted after cache invalidation failure and handles database failures safely',async()=>{
 const handler=createHandler({verifyAdminToken:async()=>true,getSql:()=>async()=>[{id:4}],invalidateSections:async()=>{throw new Error('cache unavailable');}});
 assert.equal((await handler(request('POST',payload))).statusCode,201);
 const failing=createHandler({verifyAdminToken:async()=>true,getSql:()=>{throw new Error('private configuration');}});
 const response=await failing(request('POST',payload));assert.equal(response.statusCode,500);assert.doesNotMatch(response.body,/private configuration/);
});

test('lead filter migration adds reversible indexes for type, status and combined ordered lists',async()=>{
 const migration=await readFile(new URL('../../netlify/database/migrations/0004_lead-filter-indexes.sql',import.meta.url),'utf8').catch(()=> '');
 assert.match(migration,/CREATE INDEX IF NOT EXISTS idx_leads_type_created\s+ON leads \(enquiry_type, created_at DESC, id DESC\)/);
 assert.match(migration,/CREATE INDEX IF NOT EXISTS idx_leads_status_created\s+ON leads \(status, created_at DESC, id DESC\)/);
 assert.match(migration,/CREATE INDEX IF NOT EXISTS idx_leads_type_status_created\s+ON leads \(enquiry_type, status, created_at DESC, id DESC\)/);
 for(const index of ['idx_leads_type_created','idx_leads_status_created','idx_leads_type_status_created']) assert.ok(migration.includes(`DROP INDEX IF EXISTS ${index};`));
 assert.doesNotMatch(migration,/DELETE FROM|UPDATE leads|DROP TABLE/);
});
