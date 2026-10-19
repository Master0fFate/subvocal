# subvocal — Windows installer shim. Forwards every argument to installer/install.js.
#   powershell -ExecutionPolicy Bypass -File install.ps1 [--statusline] [--uninstall] [--dry-run]
$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "subvocal: Node.js 18+ is required (https://nodejs.org)."
  exit 1
}
Set-Location -Path $PSScriptRoot
node installer/install.js @args
exit $LASTEXITCODE
