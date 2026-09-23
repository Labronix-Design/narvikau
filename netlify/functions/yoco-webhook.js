import { neon } from '@neondatabase/serverless';
import { randomBytes } from 'node:crypto';
import { buildOrderConfirmationEmail } from './_email-templates.js';
import { getHeader, hashSecret, secureStringEquals, verifyWebhookSignature } from './_security.js';
import { invalidateControlCentreSections, selectInvalidationSections } from './admin-control-centre.js';
import { purgeMutationCache } from './_mutation-cache-invalidation.js';

const ADMIN_EMAIL         = 'info@navrik.co.za';
const WARRANTY_REGISTRATION_URL = 'https://www.navrik.co.za/register-warranty';

function defaultConfig() {
  return {
    databaseUrl: process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL || '',
    webhookSecret: process.env.YOCO_WEBHOOK_SECRET || '',
    resendApiKey: process.env.EMAIL_API_KEY || '',
  };
}

function parseBody(rawBody) {
  try {
    const body = JSON.parse(rawBody);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

// Payment verification has exactly one source of truth. Historic decimal
// columns are display-only and must never be used to decide whether a Yoco
// payment settles an order.
export function readAuthoritativePaymentAmountCents(order) {
  return isPositiveInteger(order?.payment_amount_cents) ? order.payment_amount_cents : null;
}

export function createWarrantyRegistrationToken() {
  return randomBytes(32).toString('base64url');
}

function parsePositiveInteger(value) {
  if (isPositiveInteger(value)) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return isPositiveInteger(parsed) ? parsed : null;
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function createYocoStore(databaseUrl, { sql: suppliedSql } = {}) {
  const sql = suppliedSql || neon(databaseUrl);
  return {
    async getExpectedPayment(orderId) {
      const [order] = await sql`
        SELECT
          yoco_checkout_id,
          payment_amount_cents,
          status,
          yoco_payment_id,
          deposit_paid_amount_cents
        FROM orders
        WHERE id = ${orderId}
        LIMIT 1
      `;
      if (!order) return null;
      return {
        checkoutId: order.yoco_checkout_id,
        amountCents: readAuthoritativePaymentAmountCents(order),
        status: order.status,
        paymentId: order.yoco_payment_id,
        paidAmountCents: order.deposit_paid_amount_cents,
      };
    },
    async markDepositPaid(orderId, paymentId, amountCents, auditPayload) {
      const updated = await sql`
        WITH paid_order AS (
          UPDATE orders SET status = 'deposit_paid', yoco_payment_id = ${paymentId},
            deposit_paid_at = NOW(), deposit_paid_amount_cents = ${amountCents}, updated_at = NOW()
          WHERE id = ${orderId}
            AND status = 'pending'
            AND yoco_checkout_id = ${paymentId}
            AND payment_amount_cents = ${amountCents}
          RETURNING id, promo_slot_id
        ), committed_coupon AS (
          UPDATE coupon_usage_reservations reservation
          SET state = 'committed', committed_at = NOW()
          FROM paid_order
          WHERE reservation.order_id = paid_order.id AND reservation.state = 'reserved'
        ), confirmed_promo AS (
          UPDATE promo_slots slot
          SET confirmed_at = NOW()
          FROM paid_order
          WHERE slot.slot_number = paid_order.promo_slot_id
            AND slot.released_at IS NULL
            AND slot.confirmed_at IS NULL
        ), audit AS (
          INSERT INTO order_audit_log (order_id, event, old_status, new_status, amount_cents, payload)
          SELECT id, 'deposit_paid', 'pending', 'deposit_paid', ${amountCents}, ${JSON.stringify(auditPayload)}
          FROM paid_order
        )
        SELECT id FROM paid_order
      `;
      return updated.length === 1;
    },
    async markFailed(orderId, paymentId, amountCents) {
      const updated = await sql`
        WITH failed_order AS (
          UPDATE orders SET status = 'failed', updated_at = NOW()
          WHERE id = ${orderId}
            AND status = 'pending'
            AND yoco_checkout_id = ${paymentId}
            AND payment_amount_cents = ${amountCents}
          RETURNING id, promo_slot_id
        ), released_coupon AS (
          UPDATE coupon_usage_reservations reservation
          SET state = 'released', released_at = NOW()
          FROM failed_order
          WHERE reservation.order_id = failed_order.id AND reservation.state = 'reserved'
          RETURNING reservation.coupon_id
        ), decremented_coupon AS (
          UPDATE promo_coupons coupon
          SET current_uses = GREATEST(coupon.current_uses - 1, 0)
          WHERE coupon.id IN (SELECT coupon_id FROM released_coupon)
        ), released_promo AS (
          UPDATE promo_slots slot
          SET released_at = NOW(), order_id = NULL
          FROM failed_order
          WHERE slot.slot_number = failed_order.promo_slot_id
            AND slot.released_at IS NULL
            AND slot.confirmed_at IS NULL
        )
        SELECT id FROM failed_order
      `;
      return updated.length === 1;
    },
    async writeAudit(orderId, event, oldStatus, newStatus, amountCents, payload) {
      await sql`
        INSERT INTO order_audit_log (order_id, event, old_status, new_status, amount_cents, payload)
        VALUES (${orderId}, ${event}, ${oldStatus}, ${newStatus}, ${amountCents}, ${JSON.stringify(payload)})
      `;
    },
    async issueWarrantyRegistrationToken(orderId, tokenHash) {
      await sql`
        INSERT INTO warranty_registration_tokens (order_id, token_hash, issued_at, used_at)
        VALUES (${orderId}, ${tokenHash}, NOW(), NULL)
        ON CONFLICT (order_id) DO UPDATE SET
          token_hash = EXCLUDED.token_hash,
          issued_at = NOW(),
          used_at = NULL
      `;
    },
    async invalidateBusinessCache() {
      await invalidateControlCentreSections(sql, selectInvalidationSections('orders'));
    },
  };
}

function createResendSender(apiKey) {
  return async (to, subject, html) => {
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: 'Navrik <info@navrik.co.za>', to, subject, html }),
    });
    if (!result.ok) throw new Error('Email provider rejected delivery');
  };
}

async function sendConfirmationEmails(sendEmail, metadata, amountCents, warrantyRegistrationUrl = null) {
  if (!isEmail(metadata.customerEmail)) return;
  const label = typeof metadata.productLabel === 'string' ? metadata.productLabel : 'Navrik Tray';
  const name = typeof metadata.customerName === 'string' ? metadata.customerName : metadata.customerEmail;
  await Promise.all([
    sendEmail(metadata.customerEmail, `Order confirmed — ${label} | Navrik`, buildOrderConfirmationEmail(metadata, amountCents, false, false, false, warrantyRegistrationUrl)),
    sendEmail(ADMIN_EMAIL, `Deposit paid: R ${(amountCents / 100).toFixed(2)} — ${name}`, buildOrderConfirmationEmail(metadata, amountCents, true, false, false)),
  ]);
}

export function createYocoWebhookHandler({ getConfig = defaultConfig, storeFactory = createYocoStore, sendEmail, now = () => new Date(), makeWarrantyToken = createWarrantyRegistrationToken, purgeTags } = {}) {
  return async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const config = getConfig();
    const rawBody = event.body;
    if (!config.webhookSecret || !config.databaseUrl) return { statusCode: 503, body: 'Webhook not configured' };
    const verified = verifyWebhookSignature({
      secret: config.webhookSecret,
      id: getHeader(event.headers, 'webhook-id'),
      timestamp: getHeader(event.headers, 'webhook-timestamp'),
      signature: getHeader(event.headers, 'webhook-signature'),
      rawBody,
      now: now(),
    });
    if (!verified) return { statusCode: 401, body: 'Unauthorized' };

    const body = parseBody(rawBody);
    if (!body) return { statusCode: 400, body: 'Malformed webhook payload' };
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
    const orderId = parsePositiveInteger(metadata.internalOrderId);
    const hasOrder = orderId !== null;

    try {
      if (body.type === 'payment.succeeded') {
        if (!hasOrder || !isPositiveInteger(payload.amount) || typeof payload.id !== 'string' || !payload.id) return { statusCode: 400, body: 'Malformed webhook payload' };
        const store = storeFactory(config.databaseUrl);
        const expectedPayment = await store.getExpectedPayment(orderId);
        if (!expectedPayment
          || !isPositiveInteger(expectedPayment.amountCents)
          || !secureStringEquals(expectedPayment.checkoutId, payload.id)
          || expectedPayment.amountCents !== payload.amount) {
          return { statusCode: 409, body: 'Payment details do not match order' };
        }
        const alreadyPaid = expectedPayment.status === 'deposit_paid'
          && secureStringEquals(expectedPayment.paymentId || '', payload.id)
          && expectedPayment.paidAmountCents === payload.amount;
        if (alreadyPaid) return { statusCode: 200, body: 'OK' };
        if (expectedPayment.status !== 'pending') return { statusCode: 409, body: 'Payment details do not match order' };
        const changed = await store.markDepositPaid(orderId, payload.id, payload.amount, { yocoPaymentId: payload.id, metadata });
        if (!changed) return { statusCode: 200, body: 'OK' };
        try {
          await store.invalidateBusinessCache();
        } catch (error) {
          console.error('Webhook cache invalidation failed', error?.name || 'unknown error');
        }
        // Payment settlement is already committed and is the authoritative
        // outcome. A CDN purge may be temporarily unavailable, but it must
        // never make a verified payment look failed to Yoco (which would
        // trigger retries and noisy 500s). The durable order cache above has
        // already been invalidated; log the public promo refresh for follow-up.
        try {
          await purgeMutationCache('paidOrder', purgeTags, context);
        } catch (error) {
          console.error('Webhook public cache purge failed', error?.name || 'unknown error');
        }

        let warrantyRegistrationUrl = null;
        if (typeof store.issueWarrantyRegistrationToken === 'function') {
          try {
            const token = makeWarrantyToken();
            if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Invalid warranty token');
            await store.issueWarrantyRegistrationToken(orderId, hashSecret(token));
            // A fragment is never sent in the HTTP request or Referer header.
            // This keeps the bearer credential out of CDN and access logs.
            warrantyRegistrationUrl = `${WARRANTY_REGISTRATION_URL}#token=${token}`;
          } catch (error) {
            // Payment is already durably recorded. Never roll it back because a
            // secondary entitlement could not be issued; omit the CTA instead.
            console.error('Warranty registration token issue failed', error?.name || 'unknown error');
          }
        }

        if (isEmail(metadata.customerEmail) && (sendEmail || config.resendApiKey)) {
          try {
            await sendConfirmationEmails(sendEmail || createResendSender(config.resendApiKey), metadata, payload.amount, warrantyRegistrationUrl);
          } catch (error) {
            console.error('Webhook confirmation email failed', error?.name || 'unknown error');
          }
        }
        return { statusCode: 200, body: 'OK' };
      }

      if (body.type === 'payment.failed' || body.type === 'payment.cancelled') {
        if (!hasOrder || !isPositiveInteger(payload.amount) || typeof payload.id !== 'string' || !payload.id) return { statusCode: 400, body: 'Malformed webhook payload' };
        const store = storeFactory(config.databaseUrl);
        const expectedPayment = await store.getExpectedPayment(orderId);
        if (!expectedPayment
          || !isPositiveInteger(expectedPayment.amountCents)
          || !secureStringEquals(expectedPayment.checkoutId, payload.id)
          || expectedPayment.amountCents !== payload.amount) {
          return { statusCode: 409, body: 'Payment details do not match order' };
        }
        const changed = await store.markFailed(orderId, payload.id, payload.amount);
        if (changed) {
          try {
            await store.invalidateBusinessCache();
          } catch (error) {
            console.error('Webhook cache invalidation failed', error?.name || 'unknown error');
          }
          await store.writeAudit(orderId, body.type, 'pending', 'failed', null, { metadata });
        }
        return { statusCode: 200, body: 'Logged' };
      }

      return { statusCode: 200, body: 'Ignored' };
    } catch (error) {
      console.error('Webhook processing failed', error?.name || 'unknown error');
      return { statusCode: 500, body: 'Webhook processing failed' };
    }
  };
}

export const handler = createYocoWebhookHandler();
