# Smart Bussines Center

Create a brand-new Turkish-language SaaS web app named exactly “Smart Bussines Center” (keep this spelling). This is a multi-tenant business analytics platform for marketplace sellers, starting with Trendyol but designed to add other marketplaces later. The user wants a genuinely free-first setup: do not enable paid plans, paid add-ons, paid AI credits, or any paid external service; if a feature would incur a charge, leave it disabled and explain. Build a polished, responsive desktop/mobile dashboard with sidebar navigation: Genel Bakış, Mağazalar, Ürünler, Siparişler, Kârlılık, Giderler, Raporlar, Ayarlar. Use Turkish labels and TRY currency formatting. Include authentication and tenant/store ownership boundaries; never expose marketplace API secrets to the browser. For now build the working UI, data model, validation, empty states, and demo-free manual data entry flows; do not invent real sales data or imply Trendyol is connected. Add a Trendyol connection screen with fields for seller ID, API key, API secret, a clear secure-server-only handling notice, and connection status placeholder; do not request or store actual credentials yet. Build product cost entry (unit cost), order/return/cancellation records, expense entry, and a transparent profitability calculation view that separates gross sales, cancellations, returns, discounts/coupons, marketplace commission, shipping, advertising, withholding/taxes, product cost, other expenses, and net profit. Clearly mark imported/verified vs manually entered data. Add a reconciliation page to compare app totals with marketplace totals and highlight discrepancies. Use Supabase only if a free existing connection is available; do not provision any additional database or paid service without approval. First deliver a functioning visual MVP and report what works, what is still mock/placeholder, and any required manual setup. Avoid fake KPIs and fake connected states.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/faf03f7b-c711-479b-a69d-9abf7fd5ff19).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
