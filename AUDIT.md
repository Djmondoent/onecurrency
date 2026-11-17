# OneCurrency audit — 2026-10-30

## Completed

- Mainnet and testnet address validation now decodes addresses with bitcoinjs-lib, checking checksums, network and script format. Uniform uppercase SegWit addresses remain accepted. Taproot validation initializes the ECC library.
- Input key lookup fails when no matching key is found instead of returning the key at index zero.
- Both transaction builders reject missing recipients, wrong-network destinations, nonpositive/fractional/unsafe amounts, totals above Bitcoin supply, and nonfinite/nonpositive fee rates before fetching UTXOs.
- Added tests/transaction-audit.cjs: 64 regression checks across both networks, including missing-key behavior. No broadcasts or external API calls.
- TypeScript check and staged production build passed. Existing chunk-size and mixed static/dynamic import warnings remain.

## Publication and rollback

Built into /var/tmp/onecurrency-audit-build-20261030. Copied new assets into dist/assets, retained old assets for existing tabs, and replaced dist/index.html by rename. Nginx config identifies /var/www/one/dist as the served root.

Original wallet modules and full original dist are backed up at /var/backups/onecurrency/transaction-audit-20261030. To roll back, restore the original index.html first and restore the original wallet modules before rebuilding.

Published HTML references were checked against files on disk. This environment could not resolve the public domain via shell or connect to loopback HTTPS, so post-publication HTTP/browser verification is outstanding. The public site was readable through the web tool before publication.

## Remaining findings

- Fee previews use the base platform fee but selection may add up to 399 sats of leftover change to that output. Review and confirmation should show the exact selected platform fee and total debit.
- Fee size estimates assume 31-byte outputs regardless of destination script type; review estimates for Taproot and legacy outputs and mixed input types.
- Main JavaScript bundle is approximately 2.2 MB before gzip. Review lazy loading for VR, QR scanning and network-specific modules.
- README describes older seed storage and first-address-only behavior. Reconcile with current storage, address scanning, and mainnet code.
- Recovery and reload behavior for legacy plaintext mnemonic migration needs a dedicated audit before changing persistence.
- Full browser exercise of onboarding, network switching, backup recovery, camera permissions and transaction review is still needed. No real funds were moved during this pass.


## Funding integration preparation — 2026-10-30

Added a mainnet Buy Bitcoin screen, server-signed proposed MoonPay checkout adapter, client/server tests, server-only configuration sample and deployment templates. See FUNDING.md for exact behavior, limitations and launch steps. Funding is disabled until provider credentials and a running backend are configured. The user's Plaid developer account is not consumed by this hosted integration. Direct use of their Plaid account needs a compatible purchase processor selected first.
