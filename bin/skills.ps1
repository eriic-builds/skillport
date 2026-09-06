$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Skillport requires Node.js 20 or newer.'
  exit 1
}
$previousProfile = $env:SKILLPORT_POWERSHELL_PROFILE
try {
  $env:SKILLPORT_POWERSHELL_PROFILE = $PROFILE
  node (Join-Path $PSScriptRoot "skills.mjs") @args
  $skillportExitCode = $LASTEXITCODE
} finally {
  $env:SKILLPORT_POWERSHELL_PROFILE = $previousProfile
}
exit $skillportExitCode

