import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrderConfirmationEmail } from '../../netlify/functions/_email-templates.js';

test('customer order confirmation includes the issued single-use warranty link without customer data in the URL', () => {
  const html = buildOrderConfirmationEmail({
    customerName: 'Avery Customer',
    customerEmail: 'avery@example.test',
    productLabel: 'Navrik Aluminium Canopy',
    totalInclVatCents: '125000',
    depositAmountCents: '25000',
    balanceDueCents: '100000',
  }, 25000, false, false, false, 'https://www.navrik.co.za/register-warranty#token=issuedSingleUseToken_012345678901234567890123');

  assert.match(html, /href="https:\/\/www\.navrik\.co\.za\/register-warranty#token=issuedSingleUseToken_012345678901234567890123"/);
  assert.doesNotMatch(html, /register-warranty\?token=/);
  assert.match(html, /Register your warranty/);
  assert.match(html, /src="https:\/\/www\.navrik\.co\.za\/assets\/warranty-registration-qr\.png"/);
  assert.doesNotMatch(html, /avery%40example\.test|Avery%20Customer/);
});

test('customer order confirmation does not include a non-authorising generic warranty link', () => {
  const html = buildOrderConfirmationEmail({ customerName: 'Avery Customer', productLabel: 'Navrik Aluminium Canopy' }, 25000, false);
  assert.doesNotMatch(html, /register-warranty/);
});
