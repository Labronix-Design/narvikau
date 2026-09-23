# Task 2 QA review — Public catalogue truthfulness and responsive repair

**Verdict: changes requested**

## Blocking finding

1. `purchaseMode` is not authoritative when it is explicitly `online_checkout`.
   - [`resolveCatalogPurchaseMode`](../../src/website/_models/catalog.models.ts) changes an explicit `online_checkout` value to `quote_only` whenever `priceCents` is absent, zero, negative, non-integer, or otherwise invalid. The public contract requires the positive-price legacy fallback **only when `purchaseMode` is absent**. An explicit mode must be used as supplied.
   - The same interpretation appears in the cache resolver, but this review is limited to the Task 2 public UI diff. Correct the UI resolver so its fallback is reached only for a missing mode, and add coverage for an explicit `online_checkout` value with an unusable price versus a legacy item with no mode.

## Requirement checks

| Check | Result | Evidence |
| --- | --- | --- |
| `purchaseMode` authoritative; legacy fallback only when absent | **Fail** | Explicit `online_checkout` is price-gated in `resolveCatalogPurchaseMode`. |
| Quote-only product/accessory has one quote action and cannot add to cart | Pass by source review | Conditional templates render `Request a quote`; both public `addToCart` methods return unless mode is `online_checkout`. |
| Published-price cart flow remains | Pass by source review | Online items retain the product/add-selection and accessory/add-to-cart controls. |
| Names, descriptions and public prices are source-driven | Pass by source review | Templates bind `name`, `description` and cents values from catalogue models. |
| Exact public Rand formatting | Pass by source review | Online listing values use `R{{ cents / 100 | number:'1.2-2' }}`. |
| No quote-only sticky checkout contradiction | Pass by source review | Sticky bar and sticky padding are conditional on `online_checkout`. |
| Specifications wrap responsively | Pass by source review | List rows and values use `min-width: 0`; values use `overflow-wrap: anywhere`; rows stack at 768px and below. |
| UI test status reported honestly | Pass | `angular.json` has no `test` architect target. A fresh `npx ng test` exited 1 with `Cannot determine project or target for command.` No green UI-test claim is supported. |

## Test evidence

Command run:

```text
npx ng test
Cannot determine project or target for command.
```

No Jasmine UI spec executed. The added specs cover quote-only product and accessory behaviour in source, but neither confirms the explicit-mode/legacy-fallback boundary nor the retained online-checkout path. Browser verification of dynamic catalogue states was not performed in this QA review.
