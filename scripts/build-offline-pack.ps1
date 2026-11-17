$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$out = Join-Path $root 'public\onecurrency-offline.zip'

if (-not (Test-Path $dist)) {
  Write-Host 'dist folder not found. Run `npm run build` first.' -ForegroundColor Yellow
  exit 1
}

$readme = Join-Path $dist 'README.txt'
@'
OneCurrency Offline Kit

1) Open the "dist" folder in this zip.
2) Double-click "index.html" to launch the wallet offline.

Tip: Keep this folder together so the assets/ directory loads correctly.
'@ | Set-Content -Path $readme -Encoding ASCII

if (Test-Path $out) {
  Remove-Item $out -Force
}

Compress-Archive -Path $dist -DestinationPath $out
Remove-Item $readme -Force
Write-Host "Offline kit saved to $out"
