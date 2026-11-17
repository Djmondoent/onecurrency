# Releasing OneCurrency

## Release signing key

Official OneCurrency releases are signed with the DJ Billions Holdings release key.

- Name: DJ Billions Holdings (OneCurrency Releases)
- Email: ministerdjbillions@gmail.com
- Algorithm: Ed25519
- Fingerprint: ED0E DD29 FCA7 495B 0CFB 8080 2F23 771B 0C5D 7FC7
- Public key: SIGNING-KEY.asc (repository root)

The private key is stored root-only on the project server and is never committed to this repository. The key has no passphrase by design and is used only for signing release checksums.

## How to verify a release

1. From the GitHub release page, download the asset you want (for example onecurrency-app-release.apk) plus SHA256SUMS.txt and SHA256SUMS.txt.asc.
2. Import the public key and confirm the fingerprint matches the one above:

       gpg --import SIGNING-KEY.asc
       gpg --fingerprint ministerdjbillions@gmail.com

3. Verify the signature on the checksum file:

       gpg --verify SHA256SUMS.txt.asc SHA256SUMS.txt

   You should see "Good signature from DJ Billions Holdings (OneCurrency Releases)".

4. Verify the asset itself against the signed checksums:

       sha256sum -c SHA256SUMS.txt

   The asset must report OK. If either check fails, do not install the file.

## Release process (maintainers)

1. Bump the version, create a tag matching v*, and push the tag.
2. The Release workflow (.github/workflows/release.yml) runs the gates (npm audit on production dependencies, the 64 transaction checks, the web build), generates a signed build-provenance attestation for the web bundle, and creates the GitHub release with the web build attached.
3. For the Android APK: compute its SHA256, write SHA256SUMS.txt, sign it, and upload both files to the release:

       sha256sum onecurrency-app-release.apk > SHA256SUMS.txt
       gpg --detach-sign --armor --output SHA256SUMS.txt.asc SHA256SUMS.txt

4. Never publish an asset whose checksum is not covered by a signed SHA256SUMS.txt.

## Signed releases so far

- v17.5 — onecurrency-app-release.apk, SHA256 17022b3424c5dc10808b01281eb695c433df5d925a3ee19bd980be317ac22fce (signed retroactively with the key above; SHA256SUMS.txt and SHA256SUMS.txt.asc are attached to the release)
