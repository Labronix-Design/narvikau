# Task 2 — Public catalogue truthfulness and responsive repair

## Outcome

The public catalogue now treats cached `purchaseMode` as the purchase authority. A valid positive-price legacy snapshot without that field keeps the pre-migration online-checkout path; zero, missing, or non-positive prices resolve to `quote_only`.

Quote-only products and accessories present one primary action, **Request a quote**. They do not expose a cart action, a mobile sticky purchase bar, or language claiming that a price is confirmed at checkout. The product-detail cart method and the accessory cart method both enforce the same rule so a direct component call cannot create a quote-only cart selection. Quote-only compatible accessories are also filtered out of an online product's checkout selection payload.

Online-checkout catalogue entries retain their cart/payment path. Displayed public prices now use exact-cent South African Rand presentation, for example `R1,234.56`.

## Changed files

- `src/website/_models/catalog.models.ts`
  - Added the `PurchaseMode` cache contract and public-mode resolver with a positive-price legacy fallback.
- `src/website/_pages/products/products.component.{ts,html}`
  - Consumes `purchaseMode`, uses neutral catalogue/cross-link language, and displays exact-cent public prices only for online-checkout entries.
- `src/website/_pages/products/product-detail/product-detail.component.{ts,html,scss,spec.ts}`
  - Added quote-only conditional UI and cart guard; removes sticky checkout claims for quote-only products.
  - Added responsive specification protection (`min-width: 0`, wrapping, and mobile stacked label/value rows).
  - Removed the unconditional mobile sticky-bar spacing band for quote-only details.
- `src/website/_pages/accessories/accessories.component.{ts,html,scss,spec.ts}`
  - Added quote-only conditional UI and cart guard, exact-cent online prices, neutral language, and a smaller hero spacer.
- `src/website/_components/cart/cart.component.html`
  - Replaced the inaccurate generic “price confirmed at checkout” label with accurate server-calculation wording.

## Test-first coverage

Focused Jasmine tests were added before implementation for:

- a positive-price `quote_only` accessory rendering **Request a quote**, without an Add to Cart CTA, and rejecting a direct `addToCart` call;
- a positive-price `quote_only` product rendering **Request a quote**, without cart/sticky checkout wording, and rejecting a direct `addToCart` call.

The test runner cannot execute in this workspace because `angular.json` has no `test` target:

```text
npx ng test
Cannot determine project or target for command.
```

`npx tsc --noEmit -p tsconfig.spec.json` is also currently blocked by pre-existing syntax errors in `src/website/_services/cart.service.spec.ts` at lines 20, 41, and 51. That file is outside this task's ownership and was already failing when Task 2 test execution was attempted.

## Verification

- `npx tsc --noEmit -p tsconfig.website.json` — passed.
- `npm run build` — passed after sandbox filesystem permission was granted. Initial estimated transfer size: **180.94 kB**; public product and accessory pages remain lazy chunks.
- `git diff --check` — passed.
- Local browser checks at **390 px**, **768 px**, and **1440 px** found `scrollWidth === clientWidth` on `/products` (no horizontal overflow).

The Angular development server does not serve Netlify `/api` endpoints, so its local catalogue request showed the intended connection-error state. Dynamic quote-only card/detail rendering could not be browser-verified against live catalogue data without a local Netlify/API fixture; the targeted component specs cover that contract but cannot run until the test target/baseline spec errors are repaired.

## Concerns / follow-up

- Add an Angular test target and repair the existing `cart.service.spec.ts` syntax errors so the focused component specs can run in CI.
- Use a local Netlify API fixture or a non-production test cache snapshot for a full visual check of both quote-only and online-checkout cards at all required widths.
- No deployment, push, production setting change, or external communication was made.

## Fix round 1 — review findings

### Resolved findings

- `purchaseMode` is now authoritative when explicitly supplied. `online_checkout` remains online even if a display-cent value is unavailable or unusable; only an `undefined` legacy mode uses the positive-price fallback. The listing then says “Online checkout available” rather than showing a fabricated price, while retaining the online cart/payment CTA.
- Product-detail quote requests now pass selected variants and compatible accessories to `QuoteModalComponent`. The modal shows a “Selected configuration” summary and appends the same dynamic summary to the existing `Message` field submitted to `/api/quote-email`, so no endpoint or backend contract change was required.
- The online mobile sticky bar now uses `.pw-container` for the standard fluid public gutters. Its label can shrink and wrap, while its CTA remains a 44 px minimum target at 320 px.
- Quote state labels now use `--nv-text-muted`, which meets the required contrast against the card surface. Product/accessory primary card actions and the modal close control use 44 px minimum touch targets.
- The quote modal uses the already-installed Angular CDK `CdkTrapFocus`, places dialog semantics on the dialog element, moves focus to the first tabbable dialog control, closes on Escape, and restores focus to the invoker after the parent closes it.

### Additional focused tests

- Added the explicit-online-mode/missing-display-price resolver boundary.
- Added product-detail selected configuration coverage.
- Added quote-modal submission-summary and Escape/focus-restoration coverage.

The test runner remains unavailable (`npx ng test` has no configured test target), and `tsconfig.spec.json` remains blocked by the pre-existing `cart.service.spec.ts` syntax errors listed above. The focused tests were therefore added but could not execute in this workspace.

### Final verification for this round

- `npx tsc --noEmit -p tsconfig.website.json` — passed.
- `npm run build` — passed. Initial estimated transfer: **181.44 kB**.
- `git diff --check` — passed.
