$Url = $env:URL
if (-not $Url) {
  $Url = "https://api.fixnowghana.org/api/health"
}

$response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 10
$response | ConvertTo-Json -Compress

if (-not $response.ok) {
  throw "Healthcheck failed: ok=true not returned"
}
