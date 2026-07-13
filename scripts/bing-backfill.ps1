# Backfill Bing / Microsoft Ads data via bing-full-sync edge function.
# Prerequisites: OAuth connected in Settings, accounts active in client_platform_accounts.
# Usage: .\scripts\bing-backfill.ps1 -CustomerIds 254866687,254732580 -From 2026-01-01 -To 2026-07-13

param(
  [string[]]$CustomerIds = @('254866687', '254732580'),
  [string]$From = '2026-01-01',
  [string]$To = '2026-07-13',
  [string]$SupabaseUrl = $env:VITE_SUPABASE_URL,
  [string]$AnonKey = $env:VITE_SUPABASE_ANON_KEY
)

if (-not $SupabaseUrl) { $SupabaseUrl = 'https://bampwgpkydmydeauhvwn.supabase.co' }
if (-not $AnonKey) {
  Write-Error 'Set VITE_SUPABASE_ANON_KEY or pass -AnonKey'
  exit 1
}

function Get-WeekChunks([string]$start, [string]$end) {
  $chunks = @()
  $cur = [datetime]::Parse($start)
  $last = [datetime]::Parse($end)
  while ($cur -le $last) {
    $chunkEnd = $cur.AddDays(6)
    if ($chunkEnd -gt $last) { $chunkEnd = $last }
    $chunks += [pscustomobject]@{ start = $cur.ToString('yyyy-MM-dd'); end = $chunkEnd.ToString('yyyy-MM-dd') }
    $cur = $chunkEnd.AddDays(1)
  }
  return $chunks
}

$chunks = Get-WeekChunks -start $From -end $To
$headers = @{ Authorization = "Bearer $AnonKey"; apikey = $AnonKey; 'Content-Type' = 'application/json' }
$totalRows = 0

foreach ($customerId in $CustomerIds) {
  Write-Host "=== Customer $customerId ===" -ForegroundColor Cyan
  foreach ($chunk in $chunks) {
    $body = @{ customer_id = $customerId; mode = 'backfill'; date_from = $chunk.start; date_to = $chunk.end } | ConvertTo-Json
    Write-Host "  Sync $($chunk.start) -> $($chunk.end) ..."
    try {
      $resp = Invoke-RestMethod -Uri "$SupabaseUrl/functions/v1/bing-full-sync" -Method POST -Headers $headers -Body $body -TimeoutSec 300
      if ($resp.error) {
        Write-Warning "  Error: $($resp.error)"
        continue
      }
      $rows = if ($null -ne $resp.total_rows) { [int]$resp.total_rows } else { 0 }
      $totalRows += $rows
      Write-Host "  OK ($rows rows)" -ForegroundColor Green
    } catch {
      Write-Warning "  Failed: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 2
  }
}

Write-Host "Done. Total rows reported: $totalRows" -ForegroundColor Cyan
