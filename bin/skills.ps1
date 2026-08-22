$ErrorActionPreference = "Stop"
node (Join-Path $PSScriptRoot "skills.mjs") @args
exit $LASTEXITCODE

