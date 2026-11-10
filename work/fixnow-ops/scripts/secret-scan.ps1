param([switch]$History)
$ErrorActionPreference = "Stop"
# Scans what Git would publish: every tracked file in the working tree, and (with -History) every commit.
# Uses git grep, so it needs nothing beyond Git. Exits with an error if anything looks like a secret.

$patterns = @(
  'AIza[0-9A-Za-z_-]{35}',
  'AKIA[0-9A-Z]{16}',
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
  'gh[pousr]_[0-9A-Za-z]{36,}',
  'github_pat_[0-9A-Za-z_]{40,}',
  'sk_live_[0-9A-Za-z]{16,}',
  '(storePassword|keyPassword)\s*[=:]\s*\S'
)
$excluded = @(':!work/fixnow-ops/scripts/secret-scan.ps1', ':!*.example')
$revisions = if ($History) { @(git rev-list --all) } else { @() }

$found = foreach ($pattern in $patterns) {
  git grep -I -n -E -e $pattern @revisions -- . @excluded 2>$null
}

$forbiddenFiles = git ls-files | Where-Object { $_ -match '(^|/)(fixnow-secrets|node_modules|local-data)/|\.(jks|keystore|p12|pfx|pem|key|apk|aab)$|(^|/)\.env$|oracleJdk-27/' }

if ($found -or $forbiddenFiles) {
  $found | Write-Output
  $forbiddenFiles | ForEach-Object { Write-Output "Tracked file that must not be published: $_" }
  throw "Potential committed secret detected."
}

Write-Output ("Secret scan passed" + $(if ($History) { " (all commits)." } else { "." }))
