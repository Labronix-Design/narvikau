# Navrik Business Control and Quote Flow Design

## Goal

Make Navrik's public catalogue truthful about quote-only products and make the admin area a clear, accessible business-control centre with one purpose per page.

## Decisions

### Catalogue purchase contract

Each current catalogue item is classified server-side as one of:

- `online_checkout`: a live, positive, integer-cent price is available and the item may be paid for online.
- `quote_only`: a price is not published and the item may only start a quote enquiry.

`purchase_mode` is database-owned. Until every catalogue row has been explicitly migrated, an item with `price_cents <= 0` is treated as `quote_only`. The read model exposes the resolved mode; public components must not infer it from prose or use a fixed price. The checkout function rejects quote-only selections before creating any payment.

Quote-only public language is: “Pricing is confirmed in your quote after we review your vehicle and fitment.” It has one primary action, “Request a quote”. There is no cart purchase bar, checkout promise, R0 amount, or payment action.

### Business information architecture

| Route | Role | Content |
| --- | --- | --- |
| `/admin/overview` | Business overview | Linked top-level totals, latest genuine comparison, action queue, activity, data health |
| `/admin/orders` | Sales & orders | Order work queue, customer, order total, fulfilment status and actions |
| `/admin/queries` | Customer enquiries | Enquiry follow-up and quote/conversion workflow |
| `/admin/analytics` | Sales performance | Real sales, enquiry and conversion analysis only |
| `/admin/search-visibility` | Search & website traffic | Search Console and GA4 period comparisons, query/page detail |
| `/admin/reports` | Reporting | Internal report status and measurement coverage; no hosting/cost section |

The overview never duplicates tables from the work queues. A metric is clickable only when it leads to its relevant detailed page. A trend is rendered only when the server has a measured current/prior period; otherwise the UI says what is not measured and why.

### Data and cache model

The business read model uses cents and has explicit metric definitions:

- Revenue means paid/confirmed money received; pending orders do not count as revenue.
- Orders are counted by their recorded business status, with their scope labelled in the UI.
- Enquiries and conversion are based only on existing recorded states.

The server caches `business_overview`, `sales_performance`, `orders`, `enquiries`, and `search` independently. An admin order mutation invalidates/rebuilds only overview, sales performance, and orders. An enquiry mutation invalidates/rebuilds only overview, sales performance, and enquiries. A Google refresh updates only search. Public/client requests only read snapshots; a client cannot bypass or refresh a cache.

Historical database rows are preserved. Compatibility reads support legacy money columns only while the current cents model is adopted; no history is overwritten.

### Visual system and language

Shared primitives use semantic tokens for surface, text, border, brand, success, warning, danger, and neutral states. They are safe in both system light and dark colour schemes and preserve Navrik's industrial character.

Health always combines text, icon, and colour:

- Green: `Ready`
- Amber: `Needs attention`
- Red: `Action required`
- Neutral: `Not measured`

Values use exact South African Rand presentation from integer cents, for example `R1,234.56`. Supporting copy uses everyday language, such as “Refresh overview”, “Last updated”, “Orders and enquiries”, and “What this means”. Tooltips explain specialist terms without exposing configuration or secrets.

Shared layout uses one content width, resilient gutters, `min-width: 0` for text containers, responsive table-to-card transformations, neutral skeletons, and reduced-motion support. No public page assumes a published price if the catalogue says quote-only.

## Security and quality constraints

- No client-side secrets, raw/string-built SQL, or public cache refresh route.
- All money remains integer cents.
- Existing admin authentication remains mandatory for mutations and refreshes.
- Modified functions, database access, caching, and endpoints require security review and test review.
- Required checks: focused function/component tests, full function tests, applicable Angular tests, production build, authenticated visual review at 390, 768, 1024, and 1440px, light/dark modes, keyboard, overflow, skeleton, and console checks.
- No deployment, push, email, or production setting change is part of this design.
