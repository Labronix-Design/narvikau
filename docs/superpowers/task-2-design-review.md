# Task 2 design and responsive review

**Scope:** public catalogue truthfulness and responsive repair  
**Method:** source and supplied Task 2 diff review. No browser run was made: the local development server cannot provide a catalogue fixture, and the task prohibits altering browser data. The implementation report's browser check covers only the connection-error state at 390, 768, and 1440 px, not quote-only or online-checkout catalogue content.

## Verdict

**Not approved as-is — no Critical findings, but four Important findings need remediation before this can be signed off as a responsive, keyboard-accessible quote flow.**

The purchase-mode hierarchy itself is correctly implemented. Quote-only cards and detail pages remove cart and checkout claims, present a single quote action, and retain native link/button semantics. Exact-cent Rand presentation, quote-only sticky-bar removal, specification wrapping, and public container gutters are all correctly addressed in the primary content.

## Spec compliance

| Requirement | Assessment | Evidence |
| --- | --- | --- |
| Quote-only items have only an enquiry action; no cart/checkout CTA or claim | Pass | Product cards branch to `Request a quote`; accessory cards branch to a contact enquiry; detail pages render either the quote action or online cart action. [products.component.html](../../src/website/_pages/products/products.component.html#L97), [accessories.component.html](../../src/website/_pages/accessories/accessories.component.html#L108), [product-detail.component.html](../../src/website/_pages/products/product-detail/product-detail.component.html#L109) |
| Checkout wording is accurate and absent from quote-only views | Pass | Online wording now says the amount is calculated before payment; the quote branch says pricing is confirmed in the quote. [cart.component.html](../../src/website/_components/cart/cart.component.html#L44), [product-detail.component.html](../../src/website/_pages/products/product-detail/product-detail.component.html#L109) |
| Public products/accessories labels are clear and neutral | Partial | Copy is neutral and the quoted state is explicit, but the accessory price-state label fails contrast (Finding 3). [products.component.html](../../src/website/_pages/products/products.component.html#L11), [accessories.component.html](../../src/website/_pages/accessories/accessories.component.html#L109) |
| Exact-cent Rand display | Pass | Online public prices use `R{{ cents / 100 | number:'1.2-2' }}`, producing e.g. `R1,234.56`; quote-only items have no implied price. [products.component.html](../../src/website/_pages/products/products.component.html#L99), [accessories.component.html](../../src/website/_pages/accessories/accessories.component.html#L109) |
| Quote-only mobile sticky layout/blank band removed without changing online checkout | Pass | The padding class and sticky bar are applied only to `online_checkout`; quote-only keeps its inline quote CTA. [product-detail.component.html](../../src/website/_pages/products/product-detail/product-detail.component.html#L1), [product-detail.component.html](../../src/website/_pages/products/product-detail/product-detail.component.html#L129), [product-detail.component.scss](../../src/website/_pages/products/product-detail/product-detail.component.scss#L9) |
| Specification wrapping and `min-width: 0` | Pass | Rows and values can shrink; values use `overflow-wrap:anywhere`, and compact screens stack label/value pairs. [product-detail.component.scss](../../src/website/_pages/products/product-detail/product-detail.component.scss#L607) |
| Standard public gutters | Partial | Main content uses `.pw-container`, but the visible mobile checkout sticky bar has fixed `1rem` gutters rather than the shared `clamp(1rem, 5vw, 5rem)` gutter (Finding 2). [styles.scss](../../src/styles.scss#L105), [product-detail.component.scss](../../src/website/_pages/products/product-detail/product-detail.component.scss#L859) |
| Keyboard-accessible quote action | Partial | Triggers are native controls, but the modal has no focus move/trap or Escape behaviour (Finding 4). [product-detail.component.html](../../src/website/_pages/products/product-detail/product-detail.component.html#L117), [quote-modal.component.html](../../src/website/_components/quote-modal/quote-modal.component.html#L1) |

## Findings

### Important — quote-only configuration selections are not included in the enquiry

On quote-only product detail pages, users can select variants and compatible accessories, including a message that the server will validate the selected accessories. The quote action only opens the modal with the product name; the modal POST body does not include variants or selected accessories. The submitted quote can therefore omit choices that the user has visibly selected.

- Evidence: selection controls and the server-validation promise are at [product-detail.component.html](../../src/website/_pages/products/product-detail/product-detail.component.html#L78) and [product-detail.component.html](../../src/website/_pages/products/product-detail/product-detail.component.html#L91). `openQuoteModal()` only flips open state at [product-detail.component.ts](../../src/website/_pages/products/product-detail/product-detail.component.ts#L150). The quote request body contains the form values and product only at [quote-modal.component.ts](../../src/website/_components/quote-modal/quote-modal.component.ts#L68).
- Recommendation: for quote-only mode, either make choices read-only information and remove the selection affordances/copy, or pass a clear configuration summary into the quote form and submit it with the enquiry. Do not state that the server validates a configuration that is never sent.

### Important — online sticky action bar is mis-guttered and can overflow at 320 px

The quote-only blank band is correctly removed. However, the remaining online mobile sticky bar uses fixed `16px` horizontal padding while the page uses the shared fluid public gutter. At 768 px this leaves the bar substantially out of alignment with content. Its intended compact label styling is incorrectly nested below `.sticky-total`, but the template has no `.sticky-total` wrapper. Consequently, the new 40-character label inherits body-sized type, while the bar is fixed at 72 px beside a non-wrapping button; at 320 px it can wrap beyond the bar height.

- Evidence: shared gutter [styles.scss](../../src/styles.scss#L105); fixed sticky gutter [product-detail.component.scss](../../src/website/_pages/products/product-detail/product-detail.component.scss#L859); fixed 72 px bar [product-detail.component.scss](../../src/website/_pages/products/product-detail/product-detail.component.scss#L842); missing wrapper in the template [product-detail.component.html](../../src/website/_pages/products/product-detail/product-detail.component.html#L131); unreachable compact label rule [product-detail.component.scss](../../src/website/_pages/products/product-detail/product-detail.component.scss#L870).
- Recommendation: use the shared gutter token/value for `.sticky-inner`; restore an explicit label wrapper or move `.sticky-label` styling out of `.sticky-total`; give the label `min-width: 0`, `flex: 1`, compact line-height, and test the bar at 320 px and 200% zoom.

### Important — the accessory quote-state label fails WCAG AA contrast, and quote CTAs miss the 44 px target

`Pricing in quote` is the only price-state label on a quote-only accessory but uses `#555` on the `--nv-bg-panel` (`#141414`) card, approximately **2.47:1** contrast; normal text requires 4.5:1. The newly exposed primary quote link reuses `.add-btn`, whose 9 px vertical padding plus inherited type line-height yields roughly 39 px height. Product-card quote links are similarly about 40 px tall. Both are below the estate's 44×44 px target for the primary quote actions.

- Evidence: quote-state label [accessories.component.html](../../src/website/_pages/accessories/accessories.component.html#L109); its `#555` colour [accessories.component.scss](../../src/website/_pages/accessories/accessories.component.scss#L231); panel token [styles.scss](../../src/styles.scss#L27); accessory CTA dimensions [accessories.component.scss](../../src/website/_pages/accessories/accessories.component.scss#L247); product-card CTA dimensions [products.component.scss](../../src/website/_pages/products/products.component.scss#L297).
- Recommendation: use `var(--nv-text-muted)` for state text, and apply `min-height: 2.75rem` to quote/card actions while preserving the existing visual language.

### Important — quote modal does not manage keyboard focus as a modal dialog

The quote trigger is a proper native button and the modal has `role="dialog"`/`aria-modal="true"`, but opening it does not move focus into the dialog, trap tab navigation, support Escape, or restore focus to its invoker. `body` scroll locking does not prevent a keyboard user from tabbing through covered page controls. This becomes a primary public journey for quote-only products.

- Evidence: dialog markup [quote-modal.component.html](../../src/website/_components/quote-modal/quote-modal.component.html#L1); trigger [product-detail.component.html](../../src/website/_pages/products/product-detail/product-detail.component.html#L117); component state only opens/closes and has no keyboard/focus handling [quote-modal.component.ts](../../src/website/_components/quote-modal/quote-modal.component.ts#L17).
- Recommendation: use Angular CDK/Material dialog/focus-trap primitives already compatible with this Angular 21 app, or implement an equivalent focus lifecycle: focus the close button/first field on open, keep Tab/Shift+Tab within the dialog, close on Escape, and restore focus to the invoking quote control. Place dialog semantics on `.qm-dialog`, not the click-catching overlay.

## What works well

- Quote-only cards no longer disclose a positive cached price or offer cart entry, including a guard against direct method calls. [accessories.component.ts](../../src/website/_pages/accessories/accessories.component.ts#L68), [product-detail.component.ts](../../src/website/_pages/products/product-detail/product-detail.component.ts#L136)
- Online checkout keeps its own server-calculated wording and the sticky purchase affordance; quote-only avoids both. This is a clear, truthful hierarchy.
- The specification repair is robust: small screens stack the row, while longer values have a controlled breaking path rather than forcing horizontal scroll.
- Responsive layout is otherwise mobile-first in the modified product grid and uses the established public container.

## Verification limits

I did not claim visual/browser verification. The supplied report confirms no `/products` horizontal overflow only in the error state at 390, 768, and 1440 px. A fixture-backed check remains needed for both purchase modes at 320, 390, 768, and 1440 px, including keyboard Tab/Shift+Tab/Escape through a quote modal and 200% zoom.
