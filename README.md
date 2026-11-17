# OneCurrency

OneCurrency is an open-source, self-custody Bitcoin wallet that runs in the browser as a web PWA. Your keys stay on your device — OneCurrency never holds your Bitcoin.

Live app: https://onecurrency.net

## Overview
- Non-custodial Bitcoin wallet for **mainnet and testnet**, built on BIP39 + BIP84 (native SegWit / bech32 addresses).
- Create a wallet, receive with QR codes, and send with a full fee preview before you confirm.
- Testnet mode includes a built-in faucet flow, so first-time users can practice with test coins before using real BTC.
- Bulk send: paste mixed address types, split a total evenly, and send with one platform fee and one miner fee.
- Optional LNbits tab for creating Lightning invoices with your own LNbits instance.

## Fees — stated plainly
- **Platform fee: 3,337 sats per send transaction** (0.00003337 BTC), fixed.
- Plus the Bitcoin network (miner) fee, which varies and is always shown before you send.
- Receiving is free — no platform fee on receiving.

## Security & Recovery
- Encrypted backup: create an encrypted JSON backup of your seed using a passphrase. The app uses PBKDF2-SHA256 (150,000 iterations) to derive a 256-bit AES-GCM key with a random salt and IV.
- The decrypted seed is held in the session only and expires after 30 minutes.
- Decrypt & import: paste or scan the encrypted JSON and enter your passphrase; the app validates the decrypted mnemonic before importing.
- Tips:
  - Choose a long, unique passphrase and store it securely.
  - Keep multiple backups (encrypted JSON and QR). Do not lose your passphrase.
  - Never share your mnemonic or passphrase with anyone. OneCurrency will never ask for them.

## Stack
- React + Vite + TypeScript
- bitcoinjs-lib, bip39, bip32, tiny-secp256k1
- Esplora / Blockstream APIs for UTXOs, fee estimates, and broadcasting

## Run Locally
1) Install Node.js 18+.
2) From this folder, install dependencies:
   npm install
3) Start the dev server:
   npm run dev
4) Open the URL printed (usually http://localhost:5173/).
5) Production web build:
   npm run build:web

## LNbits Setup
1) Run or use an LNbits instance (your own or a hosted one).
2) Create a wallet and copy the Invoice/Read API key (the admin key is NOT required here).
3) In the app, open the LNbits tab and paste:
   - LNbits URL (e.g., https://legend.lnbits.com)
   - Invoice/Read API key
4) Create an invoice with an amount in sats and an optional memo. Copy or scan the BOLT11.

Browser/CORS note: LNbits must allow CORS from the app origin to call its REST API directly from the browser. If it does not, place a simple reverse proxy on the same origin as the app to forward requests to LNbits.

## How To Test (testnet)
1) On first load, create a new wallet in testnet mode. Write down the 12-word seed.
2) Go to Receive, copy the testnet address, and fund it from a testnet faucet.
3) Refresh to see the balance update (it may take a moment).
4) Go to Send, paste another testnet address (starts with tb1...), enter an amount in sats, review the fee preview — platform fee 3,337 sats plus the network fee — and send. You will see a txid on broadcast.
5) Track confirmations on a testnet explorer.

## Notes
- OneCurrency is experimental, self-custody software. You are responsible for your own keys and backups: if you lose your seed phrase and passphrase, no one can recover your funds.
- See AUDIT.md and AUDIT-2026-11-17.md for security review notes.

## License
MIT — see LICENSE.
