Bitcoin Testnet Wallet (Web PWA)

Overview
- Simple, non-custodial Bitcoin testnet wallet for first-time users.
- Implements BIP39 + BIP84 (bech32 addresses) on testnet.
- Receive with QR, send with fee preview, and basic balance.
- Testnet-only. Do not use for real BTC.

Security & Recovery
- Encrypted backup: Create an encrypted JSON backup of your seed using a passphrase. The app uses PBKDF2‑SHA256 (150k) to derive a 256‑bit AES‑GCM key with random salt and IV.
- Decrypt & import: Paste or scan the encrypted JSON and enter your passphrase; the app validates the decrypted mnemonic before importing.
- Tips:
  - Choose a long, unique passphrase and store it securely.
  - Keep multiple backups (encrypted JSON and QR). Do not lose your passphrase.
  - Never share your mnemonic or passphrase.

Stack
- React + Vite + TypeScript
- bitcoinjs-lib, bip39, bip32, tiny-secp256k1
- Blockstream testnet API for UTXOs, fees, and broadcasting

Run Locally
1) Install Node.js 18+.
2) From this folder, install dependencies:
   npm install
3) Start the dev server:
   npm run dev
4) Open the URL printed (usually http://localhost:5173/).

LNbits Setup
1) Run or use an LNbits instance (e.g., your own or a hosted one).
2) Create a wallet and copy the Invoice/Read API key (NOT admin key required here).
3) In the app, open the LNbits tab and paste:
   - LNbits URL (e.g., https://legend.lnbits.com)
   - Invoice/Read API key
4) Create an invoice with amount in sats and optional memo. Copy or scan the BOLT11.

Browser/CORS Notes
- LNbits must allow CORS from the app’s origin to call its REST API directly from the browser.
- If your LNbits instance doesn’t permit CORS, place a simple reverse proxy on the same origin as the app to forward requests to LNbits.

How To Test
1) On first load, click "Create New Wallet". Write down the 12-word seed.
2) Go to the Receive tab; copy the testnet address and fund it using a faucet:
   - Blockstream Testnet Faucet: search online for current link
   - Mempool Space Testnet Faucet
3) Click Refresh to see balance update (it may take a moment).
4) Go to Send tab:
   - Paste another testnet address (starts with tb1...)
   - Enter amount in sats (e.g., 5000)
   - Click Send. You should see a txid upon broadcast.
5) Track confirmations on a testnet explorer (e.g., blockstream.info/testnet/tx/<txid>).

Notes & Limits
- Keys are stored unencrypted in browser localStorage for demo simplicity.
- Only the first external address (index 0) is used for receiving and spending.
- Input selection is basic and optimized for simplicity, not optimal fee usage.
- PSBT building assumes P2WPKH UTXOs from the first address only.

Production Hardening Ideas
- Encrypt seed at rest with a passphrase (WebCrypto).
- Derive multiple addresses and scan gap limit.
- Full change management and coin control.
- Replace external API with your own backend or a full node (e.g., Electrum, Esplora).
- Add unit tests and e2e tests.
