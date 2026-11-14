#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Error "[install] ERROR: $msg"; exit 1 }
function Info($msg) { Write-Host "[install] $msg" }

if (-not (Test-Path .env)) {
  Fail ".env not found. Copy .env.example to .env and fill in required values."
}

# Load .env into process environment (simple KEY=VALUE, ignore comments/blank lines)
Get-Content .env | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  $idx = $line.IndexOf('=')
  if ($idx -lt 1) { return }
  $name = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1).Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    if ($value.Length -ge 2) { $value = $value.Substring(1, $value.Length - 2) }
  }
  [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

$required = @(
  'SITE_DOMAIN','ACME_EMAIL','BASIC_AUTH_USER','BASIC_AUTH_HASH',
  'POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DB','DATABASE_URL',
  'MINIO_ROOT_USER','MINIO_ROOT_PASSWORD',
  'S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_REGION',
  'NEXTAUTH_SECRET','NEXTAUTH_URL',
  'PAYMENT_PROVIDER','PAYMENTS_WEBHOOK_SECRET'
)
$missing = @()
foreach ($v in $required) {
  $val = [System.Environment]::GetEnvironmentVariable($v, 'Process')
  if ([string]::IsNullOrEmpty($val)) { $missing += $v }
}
if ($missing.Count -gt 0) {
  Write-Error "[install] ERROR: missing required environment variables:"
  foreach ($m in $missing) { Write-Error "  - $m" }
  exit 1
}

$secret = [System.Environment]::GetEnvironmentVariable('NEXTAUTH_SECRET','Process')
if ($secret.Length -lt 32) { Fail "NEXTAUTH_SECRET must be at least 32 characters." }

$domain = [System.Environment]::GetEnvironmentVariable('SITE_DOMAIN','Process')
if ($domain -notmatch '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$') { Fail "SITE_DOMAIN format looks invalid: '$domain'" }

$nextauthUrl = [System.Environment]::GetEnvironmentVariable('NEXTAUTH_URL','Process')
try { $nextauthHost = ([uri]$nextauthUrl).Host } catch { $nextauthHost = '' }
if ([string]::IsNullOrEmpty($nextauthHost) -or $nextauthHost -ne $domain) {
  Fail "NEXTAUTH_URL host ('$nextauthHost') must match SITE_DOMAIN ('$domain')."
}

Info "Validation passed. Starting stack..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
