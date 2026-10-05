# Diagnostic runs may collect blocked evidence; submission runs require WACK.
function Test-WindowsStoreCertificationPrerequisites {
  param(
    [Parameter(Mandatory=$true)][string]$KitPath,
    [Parameter(Mandatory=$true)][int]$SessionId,
    [Parameter(Mandatory=$true)][string]$ReportDirectory,
    [switch]$DiagnosticsOnly
  )
  if ((Test-Path -LiteralPath $KitPath -PathType Leaf) -and $SessionId -ne 0) { return $true }
  $message = 'BLOCKED: WACK requires the current Windows App Certification Kit in an interactive user session. Do not submit this package until a complete passing report is attached.'
  $message | Set-Content (Join-Path $ReportDirectory 'wack-blocked.txt')
  if (!$DiagnosticsOnly) { throw $message }
  Write-Warning 'WACK unavailable; diagnostic evidence collected, Store submission remains blocked.'
  return $false
}
