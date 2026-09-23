import { neon } from '@neondatabase/serverless';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { invalidateControlCentreSections, selectInvalidationSections } from './admin-control-centre.js';
import { resolvePurchaseMode } from './_catalogue-cache.js';
import { purgeMutationCache } from './_mutation-cache-invalidation.js';

const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY;
const BASE_URL        = process.env.URL || 'http://localhost:4200';

function selectedVariants(item) {
  if (Array.isArray(item?.variants)) return item.variants;
  if (Array.isArray(item?.selectedVariants)) return item.selectedVariants;
  if (item?.configuration && typeof item.configuration === 'object') {
    return Object.entries(item.configuration).map(([variant_type, variant_value]) => ({ variant_type, variant_value }));
  }
  return [];
}

function nonNegativeCents(value) {
  const cents = Number(value);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function basisPoints(value) {
  const points = Number(value);
  return Number.isSafeInteger(points) && points >= 0 && points <= 10000 ? points : null;
}

function isMissingPurchaseModeColumn(error) {
  return error?.code === '42703' && /purchase_mode/.test(error?.message || '');
}

async function readWithPurchaseModeFallback(readWithMode, readLegacy) {
  try {
    return await readWithMode();
  } catch (error) {
    if (!isMissingPurchaseModeColumn(error)) throw error;
    return readLegacy();
  }
}

export async function resolveCheckoutSelection({ purchaseMode, priceCents }) {
  if (purchaseMode !== 'online_checkout' || priceCents <= 0) {
    const error = new Error('This item is quoted to order and cannot be checked out online.');
    error.code = 'QUOTE_ONLY_ITEM';
    throw error;
  }
}

export async function resolveCatalogCheckout(sql, cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) throw new Error('Cart is empty');
  const resolved = [];
  for (const item of cartItems) {
    if (!item || typeof item.slug !== 'string' || !item.slug.trim()) throw new Error('Selected product is not available');
    const requestedSlug = item.slug.trim();
    if (requestedSlug.startsWith('combo:') || requestedSlug.startsWith('package:')) {
      throw new Error('This product configuration is no longer available. Please select an item from the current catalogue.');
    }
    if (requestedSlug.startsWith('accessory:')) {
      const accessorySlug = requestedSlug.slice('accessory:'.length);
      if (!accessorySlug) throw new Error('Selected accessory is not available');
      const [accessory] = await readWithPurchaseModeFallback(
        () => sql`
          SELECT id, slug, name, price_cents, purchase_mode
          FROM catalog_accessories
          WHERE slug = ${accessorySlug} AND is_active = TRUE
          LIMIT 1
        `,
        () => sql`
          SELECT id, slug, name, price_cents
          FROM catalog_accessories
          WHERE slug = ${accessorySlug} AND is_active = TRUE
          LIMIT 1
        `,
      );
      const priceCents = nonNegativeCents(accessory?.price_cents);
      if (!accessory || priceCents === null) throw new Error('Selected accessory is not available');
      await resolveCheckoutSelection({
        purchaseMode: resolvePurchaseMode({ priceCents, purchaseMode: accessory.purchase_mode }),
        priceCents,
      });
      if (selectedVariants(item).length || (Array.isArray(item.accessories) && item.accessories.length)) throw new Error('Selected accessory is not available');
      resolved.push({ productId: null, slug: requestedSlug, name: accessory.name, basePriceCents: priceCents, variantCents: 0, accessoryCents: 0, totalCents: priceCents });
      continue;
    }
    const [product] = await readWithPurchaseModeFallback(
      () => sql`
        SELECT id, slug, name, tray_type, base_price_cents, purchase_mode
        FROM catalog_products
        WHERE slug = ${requestedSlug} AND is_active = TRUE
        LIMIT 1
      `,
      () => sql`
        SELECT id, slug, name, tray_type, base_price_cents
        FROM catalog_products
        WHERE slug = ${requestedSlug} AND is_active = TRUE
        LIMIT 1
      `,
    );
    const basePriceCents = nonNegativeCents(product?.base_price_cents);
    if (!product || basePriceCents === null) throw new Error('Selected product is not available');
    await resolveCheckoutSelection({
      purchaseMode: resolvePurchaseMode({ priceCents: basePriceCents, purchaseMode: product.purchase_mode }),
      priceCents: basePriceCents,
    });

    const variants = selectedVariants(item);
    const [availableVariants, activeAccessories] = await Promise.all([
      sql`SELECT id, variant_type, variant_value, label, price_delta_cents FROM product_variants WHERE product_id = ${product.id} AND is_active = TRUE`,
      readWithPurchaseModeFallback(
        () => sql`SELECT id, slug, name, price_cents, purchase_mode FROM catalog_accessories WHERE is_active = TRUE`,
        () => sql`SELECT id, slug, name, price_cents FROM catalog_accessories WHERE is_active = TRUE`,
      ),
    ]);
    let variantCents = 0;
    const seenVariants = new Set();
    for (const selection of variants) {
      if (!selection || typeof selection.variant_type !== 'string' || typeof selection.variant_value !== 'string') throw new Error('Selected option is not available');
      const variantKey = `${selection.variant_type}\u0000${selection.variant_value}`;
      if (seenVariants.has(variantKey)) throw new Error('Selected option is not available');
      seenVariants.add(variantKey);
      const match = availableVariants.find((variant) => variant.variant_type === selection.variant_type && variant.variant_value === selection.variant_value);
      const delta = Number(match?.price_delta_cents);
      if (!match || !Number.isSafeInteger(delta)) throw new Error('Selected option is not available');
      variantCents += delta;
    }

    let accessoryCents = 0;
    const selectedAccessories = Array.isArray(item.accessories) ? item.accessories : [];
    const seenAccessorySlugs = new Set();
    for (const selection of selectedAccessories) {
      const slug = typeof selection === 'string' ? selection : selection?.slug;
      if (typeof slug !== 'string' || !slug || seenAccessorySlugs.has(slug)) throw new Error('Selected accessory is not available');
      seenAccessorySlugs.add(slug);
      const accessory = activeAccessories.find((entry) => entry.slug === slug);
      const cents = nonNegativeCents(accessory?.price_cents);
      if (!accessory || cents === null) throw new Error('Selected accessory is not available');
      await resolveCheckoutSelection({
        purchaseMode: resolvePurchaseMode({ priceCents: cents, purchaseMode: accessory.purchase_mode }),
        priceCents: cents,
      });
      const compatibility = await sql`
        SELECT product_id, tray_type FROM compatibility_matrix WHERE accessory_id = ${accessory.id}
      `;
      if (compatibility.length && !compatibility.some((rule) => rule.product_id === product.id || (rule.product_id == null && rule.tray_type != null && rule.tray_type === product.tray_type))) {
        throw new Error('Selected accessory is not compatible with this product');
      }
      accessoryCents += cents;
    }

    const totalCents = basePriceCents + variantCents + accessoryCents;
    if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error('Selected configuration has an invalid price');
    resolved.push({ productId: product.id, slug: product.slug, name: product.name, basePriceCents, variantCents, accessoryCents, totalCents });
  }
  return { items: resolved, subtotalCents: resolved.reduce((total, item) => total + item.totalCents, 0) };
}

export function resolvePaymentIntent({ payFullAmount, chargeAmountCents }) {
  return {
    amountCents: chargeAmountCents,
    isFullPayment: payFullAmount === true,
  };
}

export function buildOrderAuditPayload({
  catalogue,
  isPromo,
  promoSlotId,
  discountCents,
  totalInclVatCents,
  depositAmountCents,
  chargeAmountCents,
  isFullPayment,
  couponCode,
}) {
  return {
    isPromo,
    promoSlotId,
    discountAmountCents: discountCents,
    totalInclVatCents,
    depositAmountCents,
    chargeAmountCents,
    isFullPayment,
    couponCode,
  };
}

export async function invalidateBusinessCacheAfterCheckout(sql, invalidateSections = invalidateControlCentreSections) {
  await invalidateSections(sql, selectInvalidationSections('orders'));
}

export async function purgePromoStatusAfterCheckout(purgeTags, context) {
  // Payment confirmation must remain durable even if a non-critical edge
  // invalidation is temporarily unavailable. Admin mutations do fail closed.
  try {
    await purgeMutationCache('promo', purgeTags, context);
  } catch {
    return false;
  }
  return true;
}

// Coupon capacity is a counter, so it cannot simply be ignored at read time the
// way a stale promo slot can: the counter has to come back down. Before a
// coupon is claimed, any hold on that one coupon left behind by an abandoned
// checkout is released and the counter corrected. Scoping this to the coupon
// being contended keeps it to a single cheap statement on the checkout path,
// and the `state = 'reserved'` guard means concurrent checkouts cannot release
// the same hold twice.
export async function releaseStaleCouponReservations(sql, couponId) {
  const [released] = await sql`
    WITH stale AS (
      SELECT id FROM stale_coupon_usage_reservations WHERE coupon_id = ${couponId}
    ), released AS (
      UPDATE coupon_usage_reservations reservation
      SET state = 'released', released_at = NOW()
      WHERE reservation.id IN (SELECT id FROM stale) AND reservation.state = 'reserved'
      RETURNING reservation.id
    ), corrected AS (
      UPDATE promo_coupons coupon
      SET current_uses = GREATEST(coupon.current_uses - (SELECT COUNT(*) FROM released), 0)
      WHERE coupon.id = ${couponId} AND (SELECT COUNT(*) FROM released) > 0
      RETURNING coupon.id
    )
    SELECT (SELECT COUNT(*) FROM released)::INTEGER AS released_count
  `;
  return { releasedCount: Number(released?.released_count ?? 0) };
}

// Claims a promo slot under an advisory lock, or returns null when the promo is
// full. Slots left behind by abandoned checkouts stop consuming capacity as soon
// as they age out, so this guard agrees with the promo_status the storefront
// was shown without a periodic cleanup task.
export async function reservePromoSlot(sql, { customerEmail, customerName, maxSlots }) {
  const [slotRow] = await sql`
    WITH promo_lock AS (SELECT pg_advisory_xact_lock(741029))
    INSERT INTO promo_slots (customer_email, customer_name)
    SELECT ${customerEmail}::TEXT, ${customerName}::TEXT FROM promo_lock
    WHERE (
      SELECT COUNT(*) FROM promo_slots held
      WHERE held.released_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM stale_checkout_promo_slots stale
          WHERE stale.slot_number = held.slot_number
        )
    ) < ${maxSlots}
    RETURNING slot_number
  `;
  return slotRow?.slot_number ?? null;
}

export async function releaseCheckoutReservations(sql, { couponReservationId = null, promoSlotId = null } = {}) {
  if (couponReservationId) {
    await sql`
      WITH released AS (
        UPDATE coupon_usage_reservations SET state = 'released', released_at = NOW()
        WHERE id = ${couponReservationId} AND state = 'reserved'
        RETURNING coupon_id
      )
      UPDATE promo_coupons SET current_uses = GREATEST(current_uses - 1, 0)
      WHERE id IN (SELECT coupon_id FROM released)
    `;
  }
  if (promoSlotId) {
    await sql`
      UPDATE promo_slots SET released_at = NOW(), order_id = NULL
      WHERE slot_number = ${promoSlotId} AND released_at IS NULL AND confirmed_at IS NULL
    `;
  }
}

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: 'Method Not Allowed' };

  let sqlForReservations = null;
  let couponReservationId = null;
  let promoSlotId = null;
  try {
    const body = JSON.parse(event.body || '{}');
    const { customerData, cartItems, voucherCode, payFullAmount } = body;

    if (!customerData?.Name || !customerData?.Email || !customerData?.Phone) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Customer details required' }) };
    }
    if (!cartItems?.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Cart is empty' }) };
    }

    const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL);
    sqlForReservations = sql;

    // Validate every requested product, option and accessory before any promo or
    // coupon capacity is reserved. Invalid browser input must have no side effect.
    let catalogue;
    try {
      catalogue = await resolveCatalogCheckout(sql, cartItems);
    } catch (error) {
      const code = error?.code === 'QUOTE_ONLY_ITEM' ? 'QUOTE_ONLY_ITEM' : undefined;
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Selected configuration is not available',
          ...(code ? { code } : {}),
        }),
      };
    }
    const primary = catalogue.items[0];
    const subtotalCents = catalogue.subtotalCents;

    // ── 1. Promo config ──────────────────────────────────────────────────────
    const [cfg]       = await sql`
      SELECT max_promo_slots, discount_basis_points, standard_installation_cost_cents, deposit_basis_points
      FROM promo_config WHERE is_active = TRUE LIMIT 1
    `;
    const maxSlots = Number(cfg?.max_promo_slots);
    const discountBasisPoints = basisPoints(cfg?.discount_basis_points);
    const stdInstallCents = nonNegativeCents(cfg?.standard_installation_cost_cents);
    const depositBasisPoints = basisPoints(cfg?.deposit_basis_points);
    if (!Number.isSafeInteger(maxSlots) || maxSlots < 0 || discountBasisPoints === null || stdInstallCents === null || depositBasisPoints === null || depositBasisPoints === 0) {
      return { statusCode: 503, headers, body: JSON.stringify({ success: false, message: 'Checkout configuration is temporarily unavailable' }) };
    }

    // ── 1b. Coupon code lookup ───────────────────────────────────────────────
    let couponData = null;
    if (typeof voucherCode === 'string' && voucherCode.trim()) {
      const [coupon] = await sql`
        SELECT id, code, discount_type, fixed_discount_cents, discount_basis_points, min_order_cents, max_uses, current_uses
        FROM promo_coupons
        WHERE UPPER(code) = UPPER(${voucherCode.trim()})
          AND is_active = TRUE
          AND deleted_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
      `;
      couponData = coupon || null;
    }

    // Coupon limits and minimums are checked against the already validated,
    // server-resolved cart. Usage is claimed atomically to prevent overselling.
    if (couponData) {
      const minimumCents = nonNegativeCents(couponData.min_order_cents ?? 0);
      const couponDiscountBasisPoints = basisPoints(couponData.discount_basis_points);
      const fixedCouponDiscountCents = nonNegativeCents(couponData.fixed_discount_cents);
      if (!Number.isSafeInteger(minimumCents)
        || (couponData.discount_type === 'percent' && couponDiscountBasisPoints === null)
        || (couponData.discount_type === 'fixed' && fixedCouponDiscountCents === null)
        || subtotalCents < minimumCents) {
        return { statusCode: 422, headers, body: JSON.stringify({ success: false, message: 'Coupon does not apply to this order' }) };
      }
      await releaseStaleCouponReservations(sql, couponData.id);
      const [couponClaim] = await sql`
        WITH claimed AS (
          UPDATE promo_coupons SET current_uses = current_uses + 1
          WHERE id = ${couponData.id} AND is_active = TRUE AND deleted_at IS NULL
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (max_uses IS NULL OR current_uses < max_uses)
          RETURNING id
        )
        INSERT INTO coupon_usage_reservations (coupon_id, state)
        SELECT id, 'reserved' FROM claimed
        RETURNING id
      `;
      if (!couponClaim) {
        return { statusCode: 422, headers, body: JSON.stringify({ success: false, message: 'Coupon is no longer available' }) };
      }
      couponReservationId = couponClaim.id;
    }

    // ── 2. Atomically reserve promo slot (coupon users are excluded) ──────────
    let isPromo     = false;

    if (!couponData) {
      const slotNumber = await reservePromoSlot(sql, {
        customerEmail: customerData.Email,
        customerName: customerData.Name,
        maxSlots,
      });
      isPromo     = slotNumber !== null;
      promoSlotId = slotNumber;
    }

    let discountCents = 0;
    let installCents = stdInstallCents;

    if (couponData) {
      // Coupon applies to product subtotal only; installation is still charged
      discountCents = couponData.discount_type === 'percent'
        ? Math.round(subtotalCents * basisPoints(couponData.discount_basis_points) / 10000)
        : Math.min(nonNegativeCents(couponData.fixed_discount_cents), subtotalCents);
    } else if (isPromo) {
      discountCents = Math.round(subtotalCents * discountBasisPoints / 10000);
      installCents = 0; // promo perk: free installation
    }
    const totalInclVatCents = subtotalCents - discountCents + installCents;
    const amountExclVatCents = Math.round(totalInclVatCents * 100 / 115);
    const vatAmountCents = totalInclVatCents - amountExclVatCents;
    // Deposit: configured percentage, rounded to the nearest Rand.
    const depositAmountCents = Math.round(totalInclVatCents * depositBasisPoints / 10000) * 100;
    const fullAmountCents = totalInclVatCents;
    const requestedAmountCents = payFullAmount === true ? fullAmountCents : depositAmountCents;
    const paymentIntent        = resolvePaymentIntent({ payFullAmount, chargeAmountCents: requestedAmountCents });
    const isFullPayment        = paymentIntent.isFullPayment;
    const chargeAmountCents    = paymentIntent.amountCents;
    const balanceDueCents = isFullPayment ? 0 : totalInclVatCents - depositAmountCents;

    // ── 4. Upsert customer ───────────────────────────────────────────────────
    const nameParts = customerData.Name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName  = nameParts.slice(1).join(' ') || '';

    const [customer] = await sql`
      INSERT INTO customers (first_name, last_name, email, phone, updated_at)
      VALUES (${firstName}, ${lastName}, ${customerData.Email}, ${customerData.Phone}, NOW())
      ON CONFLICT (email) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        phone      = EXCLUDED.phone,
        updated_at = NOW()
      RETURNING id
    `;

    // ── 5. Create order ──────────────────────────────────────────────────────
    const paymentMethod = 'yoco';

    const [order] = await sql`
      INSERT INTO orders (
        customer_id,
        product_type, product_size, product_color, product_label,
        is_promo_order, promo_slot_id,
        deposit_amount_cents,
        base_price_cents, configuration_cost_cents, discount_amount_cents,
        installation_cost_cents, amount_excl_vat_cents, vat_amount_cents,
        total_incl_vat_cents, balance_due_cents, payment_amount_cents,
        is_full_payment, status, payment_method, ip_address,
        coupon_id, coupon_code
      ) VALUES (
        ${customer.id},
        ${primary.slug}, ${null}, ${null}, ${catalogue.items.map((entry) => entry.name).join(', ')},
        ${isPromo}, ${promoSlotId},
        ${depositAmountCents},
        ${primary.basePriceCents}, ${primary.variantCents + primary.accessoryCents}, ${discountCents},
        ${installCents}, ${amountExclVatCents}, ${vatAmountCents},
        ${totalInclVatCents}, ${balanceDueCents}, ${chargeAmountCents},
        ${isFullPayment}, 'pending', ${paymentMethod},
        ${event.headers['x-forwarded-for'] || event.headers['client-ip'] || null},
        ${couponData?.id ?? null}, ${couponData?.code ?? null}
      )
      RETURNING id
    `;

    if (promoSlotId) {
      await sql`UPDATE promo_slots SET order_id = ${order.id} WHERE slot_number = ${promoSlotId}`;
    }
    if (couponReservationId) {
      const attached = await sql`
        UPDATE coupon_usage_reservations SET order_id = ${order.id}
        WHERE id = ${couponReservationId} AND state = 'reserved' AND order_id IS NULL
        RETURNING id
      `;
      if (attached.length !== 1) throw new Error('Coupon reservation was not retained');
    }

    await sql`
      INSERT INTO order_audit_log (order_id, event, new_status, amount_cents, payload)
      VALUES (
        ${order.id}, 'order_created', 'pending', ${chargeAmountCents},
        ${JSON.stringify(buildOrderAuditPayload({
          catalogue,
          isPromo,
          promoSlotId,
          discountCents,
          totalInclVatCents,
          depositAmountCents,
          chargeAmountCents,
          isFullPayment,
          couponCode: couponData?.code ?? null,
        }))}
      )
    `;
    try {
      await invalidateBusinessCacheAfterCheckout(sql);
    } catch (error) {
      console.error('Checkout cache invalidation failed', error?.name || 'unknown error');
    }

    // ── Shared metadata object ───────────────────────────────────────────────
    const meta = {
      internalOrderId:    String(order.id),
      internalCustomerId: String(customer.id),
      customerEmail:      customerData.Email,
      customerName:       customerData.Name,
      customerPhone:      customerData.Phone,
      productLabel:       catalogue.items.map((entry) => entry.name).join(', '),
      productType:        primary.slug,
      isPromoOrder:       String(isPromo),
      promoSlotId:        String(promoSlotId ?? ''),
      discountBasisPoints: String(isPromo ? discountBasisPoints : 0),
      discountAmountCents: String(discountCents),
      installationCostCents: String(installCents),
      amountExclVatCents: String(amountExclVatCents),
      vatAmountCents:     String(vatAmountCents),
      totalInclVatCents:  String(totalInclVatCents),
      depositAmountCents: String(depositAmountCents),
      chargeAmountCents:  String(chargeAmountCents),
      balanceDueCents:    String(balanceDueCents),
      isFullPayment:      String(isFullPayment),
    };

    // ── YOCO checkout ────────────────────────────────────────────────────────
    if (!YOCO_SECRET_KEY) {
      await releaseCheckoutReservations(sql, { couponReservationId, promoSlotId });
      return { statusCode: 503, headers, body: JSON.stringify({ success: false, message: 'Payments are temporarily unavailable' }) };
    }

    const successUrl = isFullPayment
      ? `${BASE_URL}/?payment=success&type=full`
      : `${BASE_URL}/?payment=success`;

    const yocoRes = await axios.post(
      'https://payments.yoco.com/api/checkouts',
      {
        amount:     chargeAmountCents,
        currency:   'ZAR',
        successUrl,
        cancelUrl:  `${BASE_URL}/?payment=cancel`,
        failureUrl: `${BASE_URL}/?payment=failed`,
        lineItems: [{
          displayName:    isFullPayment ? `${meta.productLabel} — Full Payment` : `${meta.productLabel} — Deposit`,
          quantity:       1,
          pricingDetails: { price: chargeAmountCents },
        }],
        metadata:   meta,
      },
      {
        headers: {
          Authorization:    `Bearer ${YOCO_SECRET_KEY}`,
          'Content-Type':   'application/json',
          'Idempotency-Key': randomUUID(),
        },
      }
    );

    await sql`UPDATE orders SET yoco_checkout_id = ${yocoRes.data.id} WHERE id = ${order.id}`;
    await purgePromoStatusAfterCheckout(undefined, context);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, redirectUrl: yocoRes.data.redirectUrl, id: yocoRes.data.id }),
    };

  } catch (error) {
    console.error('Checkout Error:', error?.name || 'unknown error');
    if (sqlForReservations) {
      try {
        await releaseCheckoutReservations(sqlForReservations, { couponReservationId, promoSlotId });
      } catch (releaseError) {
        console.error('Checkout reservation release failed', releaseError?.name || 'unknown error');
      }
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Unable to create checkout' }),
    };
  }
};
