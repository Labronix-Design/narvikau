/**
 * Shared Navrik email templates.
 * Files starting with _ are NOT deployed as Netlify Functions.
 * Imported by create-checkout.js (SKIP_YOCO path) and yoco-webhook.js.
 */

const ADMIN_EMAIL = 'info@navrik.co.za';

const fmt = (n) =>
  Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const r = (label, value, accent = false) => `
  <tr>
    <td style="padding:10px 0;font-size:11px;color:#a3a3a3;text-transform:uppercase;
               letter-spacing:2px;font-weight:700;white-space:nowrap;
               border-bottom:1px solid #1e1e1e;">${label}</td>
    <td style="padding:10px 0 10px 20px;font-size:14px;text-align:right;
               color:${accent ? '#ea580c' : '#ffffff'};font-weight:${accent ? '800' : '600'};
               border-bottom:1px solid #1e1e1e;">${value}</td>
  </tr>`;

const gap = `<tr><td colspan="2" style="height:8px;"></td></tr>`;

// New checkout metadata carries integer cents. The legacy fallback is retained
// only to render receipts for already-created historic Yoco checkouts; it is
// never used for payment verification or order mutation.
const moneyFromMetadata = (meta, centsKey, legacyKey) => {
  const cents = Number(meta?.[centsKey]);
  if (Number.isSafeInteger(cents) && cents >= 0) return cents / 100;
  const legacy = Number(meta?.[legacyKey]);
  return Number.isFinite(legacy) && legacy >= 0 ? legacy : 0;
};

// ─── main builder ────────────────────────────────────────────────────────────
/**
 * @param {object}  meta             — Yoco metadata or equivalent plain object (values may be strings)
 * @param {number}  depositPaidCents — integer cents actually charged
 * @param {boolean} isAdmin          — true → internal notification, false → client receipt
 * @param {boolean} isTestMode       — true → show [TEST MODE] banner (SKIP_YOCO or test voucher)
 * @param {boolean} isTestOrder      — true → director voucher test; adds strong TEST warnings to customer email
 */
export function buildOrderConfirmationEmail(meta, depositPaidCents, isAdmin, isTestMode = false, isTestOrder = false, warrantyRegistrationUrl = null) {
  const m = {
    customerName:     String(meta.customerName    || 'Customer'),
    customerEmail:    String(meta.customerEmail   || ''),
    customerPhone:    String(meta.customerPhone   || ''),
    productLabel:     String(meta.productLabel    || 'Navrik Tray'),
    productType:      String(meta.productType     || 'standard'),
    isPromo:          meta.isPromoOrder === true || meta.isPromoOrder === 'true',
    promoSlot:        String(meta.promoSlotId     || ''),
    discountPercent:  Number(meta.discountBasisPoints || 0) / 100,
    discountAmount:   moneyFromMetadata(meta, 'discountAmountCents', 'discountAmount'),
    installCost:      moneyFromMetadata(meta, 'installationCostCents', 'installationCost'),
    amountExclVat:    moneyFromMetadata(meta, 'amountExclVatCents', 'amountExclVat'),
    vatAmount:        moneyFromMetadata(meta, 'vatAmountCents', 'vatAmount'),
    totalInclVat:     moneyFromMetadata(meta, 'totalInclVatCents', 'totalInclVat'),
    depositCents:     parseInt(meta.depositAmountCents || depositPaidCents || 0, 10),
    balanceDue:       moneyFromMetadata(meta, 'balanceDueCents', 'balanceDue'),
    orderId:          String(meta.internalOrderId      || meta.orderId || ''),
  };

  const firstName   = m.customerName.split(' ')[0];
  const cleanPhone  = m.customerPhone.replace(/\D/g, '');
  const depositZar  = depositPaidCents / 100;

  const subtotalBeforeDiscount = m.totalInclVat + m.discountAmount - m.installCost;

  const invoiceTable = `
    <table width="100%" cellspacing="0" cellpadding="0">
      ${r('Tray (base + coating)', `R&nbsp;${fmt(subtotalBeforeDiscount)}`)}
      ${m.discountAmount > 0
        ? r(`Launch promo discount (${m.discountPercent}%)`, `<span style="color:#ea580c;">−R&nbsp;${fmt(m.discountAmount)}</span>`)
        : ''}
      ${m.installCost > 0
        ? r('Professional installation', `R&nbsp;${fmt(m.installCost)}`)
        : r('Professional installation', '<span style="color:#ea580c;font-weight:800;">FREE — Promo</span>')}
      ${gap}
      ${r('Subtotal (excl. VAT)', `R&nbsp;${fmt(m.amountExclVat)}`)}
      ${r('VAT (15%)',             `R&nbsp;${fmt(m.vatAmount)}`)}
      ${gap}
      ${r('Total (incl. VAT)', `<strong style="font-size:16px;color:#ea580c;">R&nbsp;${fmt(m.totalInclVat)}</strong>`, true)}
      ${gap}
      ${r('20% deposit paid ✓',   `<strong>R&nbsp;${fmt(depositZar)}</strong>`, true)}
      ${r('Balance due (on delivery / install)', `R&nbsp;${fmt(m.balanceDue)}`)}
      ${m.isPromo ? `
      ${gap}
      <tr>
        <td colspan="2" style="padding-top:8px;">
          <div style="display:inline-block;background-color:#ea580c;color:#fff;
                      font-size:10px;font-weight:900;letter-spacing:2px;
                      text-transform:uppercase;padding:5px 14px;">
            LAUNCH PROMO — SLOT ${m.promoSlot} OF 25
          </div>
        </td>
      </tr>` : ''}
    </table>`;

  const nextSteps = `
    <div style="margin-top:28px;padding:20px 24px;background-color:#1a1a1a;border-left:3px solid #333;">
      <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:2px;
                  font-weight:700;margin-bottom:12px;">What Happens Next</div>
      <p style="margin:0;font-size:13px;color:#a3a3a3;line-height:1.9;">
        <strong style="color:#fff;">Step 1 —</strong> Our team will call or WhatsApp you within 1 business day to confirm your fitment appointment and vehicle details.<br>
        <strong style="color:#fff;">Step 2 —</strong> Your tray is custom-fabricated to your cab size and finish specification. Lead time is typically 5–10 business days.<br>
        <strong style="color:#fff;">Step 3 —</strong> We remove your stock tub, fit the tray with 3 heavy-duty support rails, LED lights, number plate bracket and reverse camera wiring.<br>
        <strong style="color:#fff;">Step 4 —</strong> Balance of <strong style="color:#ea580c;">R&nbsp;${fmt(m.balanceDue)}</strong> is settled on the day of fitment — cash, EFT, or card. No Yoco required for the balance.
      </p>
    </div>
    <div style="margin-top:16px;font-size:12px;color:#444;text-align:center;">
      Questions? <a href="mailto:${ADMIN_EMAIL}" style="color:#ea580c;text-decoration:none;">${ADMIN_EMAIL}</a>
    </div>`;

  const validWarrantyRegistrationUrl = typeof warrantyRegistrationUrl === 'string'
    && /^https:\/\/www\.navrik\.co\.za\/register-warranty#token=[A-Za-z0-9_-]{32,128}$/.test(warrantyRegistrationUrl)
    ? warrantyRegistrationUrl
    : null;
  const warrantyRegistration = validWarrantyRegistrationUrl ? `
    <div style="margin-top:20px;padding:20px 24px;background-color:#101010;border-left:3px solid #ea580c;">
      <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:2px;
                  font-weight:700;margin-bottom:8px;">Protect your purchase</div>
      <p style="margin:0 0 14px;font-size:13px;color:#c7c7c7;line-height:1.7;">
        Once your Navrik product has been fitted, use the private link below to register your warranty and vehicle details.
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="padding-right:16px;vertical-align:middle;">
          <a href="${validWarrantyRegistrationUrl}" style="display:inline-block;background-color:#ea580c;color:#ffffff;padding:11px 16px;font-size:11px;
              font-weight:800;text-decoration:none;letter-spacing:1px;text-transform:uppercase;">Register your warranty</a>
        </td>
        <td style="vertical-align:middle;">
          <img src="https://www.navrik.co.za/assets/warranty-registration-qr.png" width="72" height="72"
               alt="Scan to open Navrik warranty registration" style="display:block;background:#ffffff;border:0;" />
        </td>
      </tr></table>
      <p style="margin:10px 0 0;font-size:11px;color:#888;line-height:1.5;">The QR opens the registration page. Use the button in this email for your private, one-use registration link.</p>
    </div>` : '';

  const adminCustomerBlock = `
    <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:2px;
                font-weight:700;margin-bottom:14px;">Customer</div>
    <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
      ${r('Name',     m.customerName)}
      ${r('Email',    m.customerEmail)}
      ${r('Phone',    m.customerPhone)}
      ${r('Order #',  m.orderId ? `#${m.orderId}` : '—')}
    </table>
    <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:2px;
                font-weight:700;margin-bottom:14px;">Invoice Breakdown</div>
    ${invoiceTable}
    <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;">
      <tr>
        <td style="padding-right:8px;">
          <a href="mailto:${m.customerEmail}"
             style="display:block;text-align:center;background-color:#141414;color:#ea580c;
                    padding:13px;font-size:12px;font-weight:700;text-decoration:none;
                    border:1px solid #ea580c;letter-spacing:1px;text-transform:uppercase;">
            Email ${firstName}
          </a>
        </td>
        ${cleanPhone ? `<td style="padding-left:8px;">
          <a href="https://wa.me/${cleanPhone}"
             style="display:block;text-align:center;background-color:#ea580c;color:#ffffff;
                    padding:13px;font-size:12px;font-weight:700;text-decoration:none;
                    letter-spacing:1px;text-transform:uppercase;">
            WhatsApp ${firstName}
          </a>
        </td>` : ''}
      </tr>
    </table>`;

  // ── Test mode banner (admin + customer) ──────────────────────────────────
  const testBanner = isTestMode ? `
    <table width="100%" cellspacing="0" cellpadding="0"
           style="background-color:#1a0a00;border-bottom:2px solid #ea580c;">
      <tr>
        <td style="padding:10px 36px;font-size:11px;color:#ea580c;font-weight:700;
                   letter-spacing:2px;text-transform:uppercase;text-align:center;">
          ⚠ TEST MODE — YOCO BYPASSED — NO REAL PAYMENT TAKEN
        </td>
      </tr>
    </table>` : '';

  // ── Director test order warning block (customer email only) ─────────────
  const testOrderCustomerWarning = isTestOrder && !isAdmin ? `
    <table width="100%" cellspacing="0" cellpadding="0"
           style="border:2px solid #ea580c;background-color:#0a0000;margin-bottom:0;">
      <tr>
        <td style="padding:20px 28px;">
          <div style="font-size:13px;font-weight:900;color:#ea580c;text-transform:uppercase;
                      letter-spacing:3px;margin-bottom:12px;">⚠ THIS IS A TEST ORDER</div>
          <p style="margin:0;font-size:13px;color:#c0c0c0;line-height:1.8;">
            This checkout was created using a <strong style="color:#fff;">test/demonstration voucher code.</strong>
            No real payment has been taken and this order <strong style="color:#fff;">will not be processed, manufactured, or fulfilled.</strong>
          </p>
          <p style="margin:8px 0 0;font-size:12px;color:#888;">
            If you believe this is an error or you intended to place a real order, please contact us at
            <a href="mailto:${ADMIN_EMAIL}" style="color:#ea580c;">${ADMIN_EMAIL}</a>.
          </p>
        </td>
      </tr>
    </table>` : '';

  // ── Director test order notice (admin email) ─────────────────────────────
  const testOrderAdminNotice = isTestOrder && isAdmin ? `
    <table width="100%" cellspacing="0" cellpadding="0"
           style="background-color:#001a0a;border-bottom:2px solid #22c55e;margin-bottom:0;">
      <tr>
        <td style="padding:10px 36px;font-size:11px;color:#22c55e;font-weight:700;
                   letter-spacing:2px;text-transform:uppercase;text-align:center;">
          ✓ DIRECTOR TEST — VOUCHER CODE USED — DO NOT FULFIL — NOT A REAL ORDER
        </td>
      </tr>
    </table>` : '';

  const heading    = isAdmin ? `Deposit Received${m.isPromo ? ' — Promo Order' : ''}${isTestOrder ? ' [DIRECTOR TEST]' : ''}` : (isTestOrder ? '⚠ Test Order Confirmed' : 'Order Confirmed!');
  const subheading = isAdmin
    ? `${m.customerName} · ${m.productLabel}`
    : (isTestOrder
        ? `Hi ${firstName}, this is a TEST checkout — no real payment was taken and this order will not be fulfilled.`
        : `Hi ${firstName}, your 20% deposit has been received and your order is confirmed.`);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:40px 20px;background-color:#050505;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;">
  <tr><td>
    ${testOrderAdminNotice}
    ${testBanner}
    ${testOrderCustomerWarning}
    <table width="100%" cellspacing="0" cellpadding="0"
           style="border-top:4px solid ${isTestOrder ? '#ea580c' : '#ea580c'};background-color:#000000;">
      <tr>
        <td style="padding:32px 36px;">
          <div style="font-size:10px;color:#ea580c;text-transform:uppercase;
                      letter-spacing:3px;font-weight:700;margin-bottom:8px;">NAVRIK${isTestOrder ? ' · TEST ORDER' : ''}</div>
          <div style="font-size:26px;color:#ffffff;font-weight:900;
                      letter-spacing:-0.5px;">${heading}</div>
          <div style="font-size:14px;color:#a3a3a3;margin-top:6px;
                      line-height:1.5;">${subheading}</div>
        </td>
        ${m.isPromo && isAdmin ? `
        <td style="padding:32px 36px 32px 0;vertical-align:top;white-space:nowrap;">
          <div style="background-color:#ea580c;color:#fff;font-size:10px;font-weight:900;
                      letter-spacing:2px;text-transform:uppercase;padding:6px 14px;">
            PROMO #${m.promoSlot}
          </div>
        </td>` : ''}
      </tr>
    </table>
    <table width="100%" cellspacing="0" cellpadding="0"
           style="background-color:#141414;">
      <tr><td style="padding:32px 36px;">
        ${isAdmin ? adminCustomerBlock : `
          <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:2px;
                      font-weight:700;margin-bottom:14px;">Your Invoice — ${m.productLabel}</div>
          ${invoiceTable}
          ${isTestOrder ? '' : `${nextSteps}${warrantyRegistration}`}`}
      </td></tr>
    </table>
    ${isTestOrder && !isAdmin ? `
    <table width="100%" cellspacing="0" cellpadding="0" style="background-color:#0a0000;">
      <tr><td style="padding:20px 36px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#666;line-height:1.7;">
          This email was generated automatically by the Navrik test checkout system.<br>
          Reference: <strong style="color:#444;">TEST-${m.orderId || 'N/A'}</strong> — No fulfilment action required.
        </p>
      </td></tr>
    </table>` : ''}
    <table width="100%" cellspacing="0" cellpadding="0"
           style="background-color:#0a0a0a;border-top:1px solid #1e1e1e;">
      <tr>
        <td style="padding:18px 36px;text-align:center;font-size:10px;
                   color:#333;letter-spacing:1px;">
          NAVRIK &mdash; Built Tough for Africa &mdash; navrik.co.za
        </td>
      </tr>
    </table>
  </td></tr>
  </table>
</body>
</html>`;
}
