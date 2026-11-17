# OneCurrency Faucet (static demo)

A standalone, no-signup faucet front-end. Users enter a Bitcoin address, solve a simple captcha, and claim **41 sats every hour**. When they reach 30,000 sats or more, they can submit a manual withdrawal request that posts to our Formspree queue for review (24-48h). All balances are local to the device (stored in `localStorage`) and are not held by OneCurrency.

## Quick start
1. Open `index.html` in your browser (no build needed).
2. Enter a Bitcoin address (bech32 or legacy) and solve the math captcha.
3. Press **Claim sats**. The countdown enforces one claim per hour per device. Toggle **Auto-claim** to automatically claim when the cooldown finishes.
4. When balance ≥30,000 sats, confirm the Bitcoin address, enter your contact email and amount, then hit **Submit withdraw request**. We'll post the address/amount/email to Formspree and reset the local balance to zero while the manual payout is processed.

## Notes
- This is a front-end only demo; no BTC is held server-side.
- Balances live in `localStorage`; clearing site data resets them.
- The Lucky Spin bonus lets you roll once per hour (1/10,000 odds). Rolling 9999 grants 20,000 sats to your balance.
- Add a backend later to verify captchas, enforce IP/device rate limits, and pay withdrawals automatically.
