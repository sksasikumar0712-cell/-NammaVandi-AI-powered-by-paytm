# NammaVandi AI

**Your trusted street vendor. Now just a WhatsApp message away.**

Powered by Paytm — an independent integration prototype, not an official Paytm product, endorsement or sponsorship.

A local-first Tamil Nadu street-vendor commerce MVP. Customers gain predictable arrival windows, clear prices, reservations and handoff choices. Vendors see customer demand before buying at the wholesale market. This is not a quick-commerce delivery platform.

## Run locally

Requires Node.js 22.13+ (tested on Node 24), npm, and a writable local directory. SQLite's native dependency may require build tools if a prebuilt binary is unavailable.

```bash
git clone -- https://github.com/sksasikumar0712-cell/-NammaVandi-AI-powered-by-paytm.git nammavandi-ai
cd nammavandi-ai
npm ci
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:3000**. No account, API key or payment credentials are required. All five pages use the same persisted SQLite database; a reload retains your orders and messages. The dev and production scripts bind to loopback deliberately: this single-vendor local demo has no production authentication. Do not expose the administrative application on a public tunnel.

```bash
npm run lint
npm run test
npm run build
npm run test:smoke
npm start
```

The migrations are idempotent and seed only an empty database. `npm run db:seed` creates fictional products, customers, inventory, four confirmed orders and a market request. Phone identifiers are deliberately non-dialable. All prices are fictional, not market quotations. Dates use Asia/Kolkata. Run seed once; it does not reset user changes. A new day needs prices and stock entered in Inventory (Edit creates the new daily row); old prices are never silently carried forward. Back up your ignored SQLite file before resetting it.

## Working pages

- `/dashboard`: real order totals, pending payments, route schedule, low stock, street demand and market requests; downloadable persisted purchase summary.
- `/inventory`: add products, edit stock/cost/selling price, disable availability, search aliases, apply a manually supplied wholesaler CSV (name, wholesale rupees, selling rupees). Batch import rolls back on invalid rows.
- `/orders`: review draft/confirmed orders, quote or reject requests, confirm, pack, ready, deliver, cancel and simulate refunds.
- `/routes`: edit visiting days, arrival windows and statuses; copy an announcement for manual posting to an existing WhatsApp group.
- `/playground`: persistent WhatsApp-style simulator with customer switching and vendor view, text/Tamil/Tanglish input, microphone recording, audio/image upload, review, editable cart quantities, reservations, handoff instructions and mock checkout.

## Demo walkthroughs

1. Select a customer in Playground and click **₹65 sample cart**. Send `ara kilo vendakkai, rendu kattu arai keerai`. Review 0.5 kg okra at ₹50/kg and 2 bunches at ₹20/bunch. Confirm to reserve ₹65. Open mock Paytm checkout and simulate success or failure. Payment never relies on a browser success flag in live mode.
2. Send `naalaiku murungakkai 1 kg vangitu vaanga`. Switch to Vendor view. Enter a price, agreed quantity and minimum, then approve. Switch back and explicitly confirm the quote. Only now does it enter confirmed procurement. No payment link is possible before finalisation.
3. Include unavailable drumstick alongside in-stock tomato. Skip the drumstick request to confirm available items alone, or wait for a vendor quote.
4. Choose a security/neighbour handoff. Mark packed → ready → delivered in vendor view. Payment remains a separate state; pay-on-delivery is allowed (manual cash collection recording is not implemented).
5. Cancel a reserved order to release stock. Cancelling a mock paid order sets refund pending; use **Simulate verified refund** to finish the mock refund.
6. Upload an image or voice note. Without Sarvam credentials, the result is explicitly a sample, not analysis of the uploaded file. Edit the text and send it yourself. Media files are not persisted.

## Architecture and invariants

Next.js App Router + TypeScript + Tailwind 4 + Lucide. Server route handlers use Zod discriminated-union validation and call the shared `Engine`. The dashboard purchase download uses a local-only Next.js Server Action backed by that same engine; HTTP clients can use the summary route action. The simulator and signed WhatsApp messages both call `Engine.message`.

`src/lib/schema.ts` contains the Drizzle relational models. `migrations/0001.sql` defines SQLite tables, foreign keys, indexes and stock checks. Numbered SQL migrations are applied transactionally and recorded in `schema_migrations`; `0002.sql` adds indexes for current lookup paths, including to existing databases. Drizzle handles typed persistence for messages and purchase summaries; prepared SQLite statements handle joins and atomic stock operations through the same connection. `BEGIN IMMEDIATE`, guarded updates and rollback prevent competing reservations exceeding stock. WAL and a busy timeout support multiple local connections.

- Money is integer paise; quantity is integer thousandths of the displayed unit (1000 = 1 kg / 1 bunch / one 100g unit). Line totals round once to paise.
- Text parsing is deterministic and alias-based, not an LLM inventing prices. Transcription is a separate adapter. Missing, zero, conflicting or incompatible quantities are flagged with a 1-unit suggestion, blocked from reservation until corrected, and all carts require explicit review. Decimal/fractional weights, Tamil digits and repeated product mentions are supported. Weight conversions respect each product’s actual selling unit (for example 1 kg jasmine = ten 100g units). Use **Apply quantity** to correct a draft in place. An unclear or incompatible quantity cannot be confirmed until corrected. Increasing an in-stock line beyond available stock converts it into a vendor market request. Editing an existing request invalidates its previous quote, requiring fresh approval. To change products, cancel the draft and send a revised list.
- Current vendor inventory provides prices. Drafts do not reserve stock. Confirmation rechecks inventory date and price atomically.
- Special requests are PENDING_VENDOR → QUOTED → CONFIRMED, or REJECTED/CANCELLED. Only confirmed, unfulfilled requests enter confirmed procurement. Requested demand is displayed separately. Purchase plans aggregate by product and visit date, preserving street-level breakdowns; delivered and cancelled requests drop out. Dashboard daily statistics use the scheduled visit date, not the date a message was first sent.
- Operational state: DRAFT / PENDING_VENDOR_APPROVAL / AWAITING_CUSTOMER_CONFIRMATION → CONFIRMED → PACKED → READY → DELIVERED, with permitted cancellation edges.
- Payment state: UNPAID → AWAITING_PAYMENT → PAID or FAILED; cancellation after success → REFUND_PENDING → REFUNDED. A late verified payment on a cancelled order becomes REFUND_PENDING.
- Message IDs deduplicate incoming messages. Repeated confirmation is idempotent. Payment transaction IDs are unique and repeated settlement cannot double-credit.
- Cancellation releases reserved stock; delivery consumes stock. Confirmed special requests are procurement obligations, not present inventory, and do not decrement existing stock.

## Integrations

### Sarvam

Set `SARVAM_API_KEY` in `.env`. The adapter calls `https://api.sarvam.ai/speech-to-text` with multipart audio, `model=saaras:v4` (configurable), `mode=codemix`, and automatic language detection. Tamil, English and code-mixed inputs are supported by the provider; actual accuracy requires live testing. Default no-key mode returns a labelled sample. Files are limited to 10 MB. REST voice recordings should be short (under 30 seconds). Microphone capture requires localhost or a secure context and browser permission.

Image extraction is intentionally mock/manual. No compatible vision API is configured, and the interface explicitly says the image was not analysed. Replace `extractImage` behind its current contract to add a live provider.

### Paytm staging

Set `PAYMENT_MODE=staging`, `PAYTM_MID` and `PAYTM_MERCHANT_KEY` on the server. Optionally set `APP_URL` to your HTTPS webhook origin to include a callback URL in newly created links (a laptop localhost URL is not reachable by Paytm). Restart Next.js. Create new orders after changing modes; existing payment rows retain their provider. The server creates FIXED payment links at `https://securestage.paytmpayments.com/link/create`, signs request bodies with the official `paytmchecksum` package and verifies response signatures. It stores only link/transaction identifiers, amounts and statuses. A database claim prevents simultaneous requests from creating multiple links for an order; cancellation during the network call remains cancelled, and a later verified success becomes refund pending. A process crash during link creation can leave `CREATING_LINK` pending and needs merchant reconciliation before retry; a durable background reconciliation worker is not included.

Use **Verify payment** to reconcile through `/link/fetchTransaction`. A signed server response must match the persisted link and exact paise amount before settlement. `/api/webhooks/paytm` accepts form callbacks, verifies CHECKSUMHASH and then reconciles the known link; unsigned callbacks cannot mark orders paid. Link callback fields vary with merchant configuration; on-demand reconciliation is the primary tested design, not a claim of universal callback delivery. Unknown link references are rejected. Live refunds are not automated: real refund-pending orders require processing in the merchant dashboard and a future verified refund adapter. The only executable refund completion here is explicitly mock.

Staging APIs are implemented but **not live-validated without credentials**. Production endpoints are deliberately not enabled. Never place merchant keys in NEXT_PUBLIC variables.

### Meta WhatsApp Cloud API

Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, and optionally the supported `WHATSAPP_GRAPH_VERSION` for your app. GET `/api/webhooks/whatsapp` verifies subscription challenges; POST verifies the raw request HMAC before parsing. Pre-register a consenting customer's real E.164 digits in the database and set `opt_in=1`; the fictional seed identifiers cannot receive real messages. No unsolicited sends occur from seeding or the simulator.

A deployment of the webhook adapter needs HTTPS, authentication/isolation for the administration surface and a durable retry worker before real use. Inbound text reaches the same engine as the playground. Audio/images are downloaded through authenticated Meta media retrieval, then sent for review; mock media output is never silently treated as the user's real shopping list. MVP live WhatsApp creates drafts and replies; final confirmation/payment handling is vendor-assisted in the local UI. The complete automated 1:1 WhatsApp checkout dialogue is a remaining integration task.

Only replies to inbound messages are sent. For business-initiated messages outside Meta's customer-service window, implement approved templates and opt-in controls first. Group announcements are copied and posted manually; no ordinary group poll automation or unofficial WhatsApp Web automation is used.

## Tests

Vitest covers in-stock ordering, Tamil/Tanglish quantities, aliases, paise rounding, ambiguous quantities, special-request approval and minimums, last-unit contention/transaction rollback, duplicate messages/confirmation, mock success/failure/retry, unverified or wrong-amount rejection, stock release/refunds, date-aware street aggregation and purchase planning, delivery transitions, stale prices, request rejection, cart correction, Meta HMAC checks and credential-free media mocks. A real two-process SQLite test competes for the last unit. Migration tests upgrade a legacy database twice and verify record preservation. GitHub Actions runs migration, seed, lint, tests and production build.

## Known local MVP limits

Single merchant, no login or multi-tenant permissions; localhost-only administration. No automated reservation expiry, background scheduler, live vehicle GPS, dynamic ETAs or route optimisation. Route windows are vendor estimates; schedules are labels rather than a calendar engine. Product changes require draft cancellation/re-submission. The bounded alias parser does not understand arbitrary prose, unknown products or every Tamil inflection; inspect every cart. Conflicting quantities require correction; repeated explicit product quantities are summed. Special requests support catalogued products only. Procurement summaries are planning records, not automatic supplier orders. No cash-collection reconciliation, production payment/refund certification, or real customer notifications tested. An unpaid delivered order can still use online checkout. This source was implemented and verified in a cloud workspace; clone it and run the setup commands above to use your laptop’s localhost. No remote execution can start a process on your laptop without a connected local environment. All providers require credentials and integration testing before real commerce.

## Official references consulted

- https://docs.sarvam.ai/api-reference/speech-to-text/transcribe
- https://www.paytmpayments.com/docs/api/create-link-api/
- https://www.paytmpayments.com/docs/api/fetch-transaction-link-api/
- https://www.paytmpayments.com/docs/jscheckout-verify-payment
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started/
- https://whatsapp.github.io/WhatsApp-Nodejs-SDK/receivingMessages/
