$ErrorActionPreference = "Stop"

$patterns = @(
  'AIza[0-9A-Za-z_-]{35}',
  'AKIA[0-9A-Z]{16}',
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
  'ghp_[0-9A-Za-z]{36,}'
)

$targets = @("outputs", "work/fixnow-backend", "work/fixnow-android", "work/fixnow-ops")
$matches = foreach ($pattern in $patterns) {
  rg --line-number --hidden --glob '!**/test-data/**' --glob '!**/build/**' --glob '!**/*.example' --glob '!**/secret-scan.ps1' -- $pattern $targets 2>$null
}

if ($matches) {
  $matches | Write-Error
  throw "Potential committed secret detected."
}

Write-Output "Secret scan passed."
