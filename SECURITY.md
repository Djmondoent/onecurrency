# Security Policy

## Reporting a vulnerability

OneCurrency is self-custody software: vulnerabilities matter, and we want to hear about them.

- **Please do not open a public issue for a security vulnerability.**
- Report privately by email: **ministerdjbillions@gmail.com** with the subject line: OneCurrency security report
- Include what you found, steps to reproduce, and the version or commit you tested.
- We aim to acknowledge reports within 3 business days and to publish a fix or a status update as quickly as the severity requires.

Independent audits, code reviews, and pull requests are welcome.

## Supported versions

Only the latest release and the main branch are supported with security updates.

## Security model (summary)

- **Self-custody:** private keys and seed phrases are created and stored on the user device only. OneCurrency never holds user Bitcoin and has no custodial accounts.
- **Encrypted backups:** PBKDF2-SHA256 with 150,000 iterations derives a 256-bit AES-GCM key; backups are encrypted JSON protected by the user passphrase.
- **Session handling:** the decrypted seed lives in the browser session only and expires after 30 minutes.
- **Fees, stated plainly:** a fixed platform fee of 3,337 sats per send transaction, plus the Bitcoin network fee, always shown before sending. Receiving is free.
- **Reviews:** see AUDIT.md and AUDIT-2026-11-17.md in this repository for security review notes, and the Open Source section at https://onecurrency.net for how to audit the code yourself.

## Out of scope

- Vulnerabilities in third-party services the wallet connects to (explorers, price APIs, a user-supplied LNbits instance).
- Issues that require a compromised user device or a user-entered seed phrase on a malicious site.
