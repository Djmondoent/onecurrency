# Bank and card purchases

## Current status

The mainnet wallet has a Buy Bitcoin tab and a proposed MoonPay hosted-checkout integration. Purchases stay disabled until the funding API is deployed and enabled with matching provider credentials. A Plaid developer account exists; no purchase-provider account or credentials have been supplied. The user's own Plaid account is not used by this implementation.

MoonPay checkout was chosen as the initial adapter for review. It handles purchase execution, customer identity checks and bank/card details, and sends purchased Bitcoin to the wallet's current mainnet receiving address. Its US bank funding may use MoonPay Balance and Plaid, subject to account eligibility; other regions use local supported payment methods. Checkout ultimately determines eligibility, available methods, rates, fees and limits. There is no claim of universal country or credit-card availability.

For broad coverage, the default currency option lets customers choose their local currency and amount at checkout. USD, EUR and GBP are optional preset currencies. Bank/card choices are preferences: when unavailable, MoonPay shows eligible alternatives. USD bank preference maps to MoonPay Balance, GBP to Open Banking and EUR to SEPA. A USD bank purchase may require funding a MoonPay Balance first; an empty balance or unavailable method may fall back to another checkout option. Validate this journey with the partner before launch.

The implementation does not debit accounts through the user's Plaid API account. If direct Plaid ownership is required, select a purchase/payment processor with a documented Plaid processor-token integration first. Then implement authenticated customer/account ownership, durable encrypted token storage, processor token exchange, purchase/settlement state, and verified webhooks against that processor's contract. A standalone Plaid Link success must never be treated as a funded Bitcoin wallet.

## Request flow

1. Mainnet Buy Bitcoin checks GET /api/funding/config. A missing API, HTML SPA fallback, invalid configuration or disabled flag leaves checkout disabled.
2. The customer reviews their delivery address and grants permission to share it. This resets when the address or purchase options change.
3. POST /api/funding/checkout accepts only the reviewed address, explicit mainnet network, currency, whole fiat amount (or null for automatic currency), payment preference and consent.
4. The server validates the mainnet checksum, origin, content type, payload size, amount and rate limit. It constructs its own MoonPay URL, pins BTC and the destination, signs the complete query using HMAC-SHA256, and binds it to the verified client IP.
5. The browser verifies the returned host, asset, address and environment before showing the checkout link. The link opens on a separate origin with no opener access. URLs are kept only in component memory and cleared on option/address changes, navigation or after three minutes; this local timer is not a provider-enforced expiry guarantee.
6. The customer authorizes payment on MoonPay. OneCurrency's balance continues to come from Bitcoin network data. A redirect or client event never increases balance or claims payment success.

## Deployment

Backend source: server/funding.mjs and server/index.mjs. The API is stateless and does not save account details, card details, recovery phrases or purchase history. Rate limiting is in-memory for the single service instance; use a shared limiter before scaling to multiple instances. Preparing a checkout URL itself does not execute a purchase, so no OneCurrency login is needed for that endpoint. Customer authentication and payment authorization happen with the provider.

Run npm run test:funding, npm run build:funding and npm run build. Backend runtime requires Node 20+ and is bundled into build/funding-api.cjs; deploy that bundle separately from the web root, for example /var/lib/onecurrency-funding/funding-api.cjs, with readable permissions for the service user. No dependency-directory access is needed by that bundle.

Store real credentials outside /var/www. Copy the funding settings from .env.example to /etc/onecurrency/funding.env with mode 0600. systemd reads this file; the environment file is not automatically loaded by npm run start:funding. For a manual sandbox run on a recent Node, use node --env-file=/etc/onecurrency/funding.env server/index.mjs.

Start with FUNDING_ENABLED=true, MOONPAY_ENV=sandbox and matching pk_test_/sk_test_ keys. Keep FUNDING_LIVE_ENABLED=false. Register the production domains with MoonPay. Inspect and install the deployment templates in deploy/ for systemd and nginx. The service binds only to 127.0.0.1:3101. The nginx location must override True-Client-IP with the verified client address. If using a CDN, configure nginx real_ip using only that CDN's trusted source ranges; never trust arbitrary incoming client-IP headers. Confirm the IP received by MoonPay matches the one signed by this service, including IPv4/IPv6 and proxy/mobile behavior.

The web deployment files in /var/www/one/dist have been updated with the disabled-by-default Buy Bitcoin screen; previous files are backed up at /var/backups/onecurrency/funding-20261030. Post-publication HTTP/browser verification remains outstanding. The templates are not installed in /etc and the service has not been activated. The current nginx configuration otherwise falls back to SPA HTML for API requests. Installation and service activation require access to host configuration outside this workspace.

Sandbox checkout, identity verification, bank funding, credit/debit cards, unsupported regions, address changes, cancellations, return flow and on-chain arrival must be exercised with the actual provider account before launch. Provider approval and IP matching enforcement are required for production. Activate only with matching pk_live_/sk_live_ keys, MOONPAY_ENV=production, FUNDING_ENABLED=true and FUNDING_LIVE_ENABLED=true after those tests. Do not place secret keys in VITE_* variables, source control, web assets or chat.

## Validation

- 12 server tests cover signatures against MoonPay's official vector, credential/live gates, destination/network validation, IP binding, parameter injection, origin checks, regional preferences and throttling.
- 4 frontend-client tests cover SPA fallback, request shape, unsafe or mismatched checkout responses and service errors.
- TypeScript and web/backend builds are checked separately. No payment was collected and no bank account was linked during development.
- Browser checkout and real provider API acceptance remain untested without credentials. The workspace also rejects binding a local HTTP socket (EPERM), so an HTTP server smoke test could not run here; native Request/Response handler tests passed.

## References

- Plaid account linking: https://plaid.com/docs/link/
- Plaid bank transfer lifecycle: https://plaid.com/docs/transfer/creating-transfers/
- MoonPay URL integration: https://dev.moonpay.com/widget/on-ramp/integration-methods/url
- Parameters and payment preferences: https://dev.moonpay.com/widget/on-ramp/customization/parameters
- Server URL signing: https://dev.moonpay.com/widget/on-ramp/customization/url-signing
- Required IP binding: https://dev.moonpay.com/widget/on-ramp/customization/ip-matching
- US Plaid/Balance funding: https://support.moonpay.com/en/articles/381106-moonpay-balance-how-to-top-up-use-and-withdraw
