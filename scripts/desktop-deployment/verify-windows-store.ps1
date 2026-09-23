param([Parameter(Mandatory=$true)][string]$Package, [Parameter(Mandatory=$true)][string]$ReportDirectory)
$ErrorActionPreference = 'Stop'
$publisher = 'CN=0AC0922B-9A14-4E11-AC48-1A1AC49C81E1'
$name = 'Tuturuuu.Tuturuuu'
if (Get-AppxPackage -Name $name) { throw 'Refusing to replace an existing installed app during CI validation' }
$certificate = $null
$installed = $null
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('tuturuuu-msix-test-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $temporary | Out-Null
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
try {
  $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  $signTool = Get-ChildItem $sdkRoot -Filter signtool.exe -Recurse | Where-Object { $_.Directory.Name -eq 'x64' } | Sort-Object FullName -Descending | Select-Object -First 1
  if (!$signTool) { throw 'Windows SDK SignTool required for isolated installation test' }
  # Ephemeral, runner-local trust only. The unsigned submission artifact is untouched.
  $certificate = New-SelfSignedCertificate -Type Custom -Subject $publisher -KeyUsage DigitalSignature -FriendlyName 'Tuturuuu CI package test only' -CertStoreLocation 'Cert:\CurrentUser\My' -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3','2.5.29.19={text}')
  $publicCertificate = Join-Path $temporary 'test.cer'
  Export-Certificate -Cert $certificate -FilePath $publicCertificate | Out-Null
  Import-Certificate -FilePath $publicCertificate -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
  $signed = Join-Path $temporary 'test.msix'
  Copy-Item $Package $signed
  & $signTool.FullName sign /fd SHA256 /sha1 $certificate.Thumbprint $signed
  if ($LASTEXITCODE -ne 0) { throw 'Temporary test signing failed' }
  Add-AppxPackage -Path $signed
  $installed = Get-AppxPackage -Name $name
  if (!$installed -or $installed.Publisher -ne $publisher -or $installed.PackageFamilyName -ne 'Tuturuuu.Tuturuuu_3fbz370g3eega') { throw 'Installed Store package identity mismatch' }
  Start-Process explorer.exe "shell:AppsFolder\$($installed.PackageFamilyName)!Tuturuuu"
  $deadline = (Get-Date).AddSeconds(60)
  do {
    Start-Sleep -Milliseconds 500
    $app = Get-Process tuturuuu -ErrorAction SilentlyContinue | Where-Object { $_.Path.StartsWith($installed.InstallLocation) -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  } while (!$app -and (Get-Date) -lt $deadline)
  if (!$app) { throw 'Installed Store package did not show its first-frame window' }
  Start-Process 'com.tuturuuu.app.mobile://login-callback?desktop_smoke=1'
  Start-Sleep -Seconds 3
  $app.Refresh()
  if ($app.HasExited -or $app.MainWindowHandle -eq 0) { throw 'Installed app failed URI activation' }
  'Installed identity, first-frame window, and harmless URI activation passed. Authentication and Store upgrade still need device testing.' | Set-Content (Join-Path $ReportDirectory 'runtime.txt')
  Stop-Process -Id $app.Id
  $wack = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\App Certification Kit\appcert.exe'
  if (!(Test-Path $wack) -or [Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) {
    'BLOCKED: WACK requires the current Windows App Certification Kit in an interactive user session. Do not submit this package until a complete passing report is attached.' | Set-Content (Join-Path $ReportDirectory 'wack-blocked.txt')
    Write-Warning 'WACK unavailable; Store submission remains blocked pending interactive Windows certification testing.'
  } else {
    & $wack reset
    & $wack test -packagefullname $installed.PackageFullName -reportoutputpath (Join-Path $ReportDirectory 'wack.xml')
    if ($LASTEXITCODE -ne 0) { throw 'Windows App Certification Kit reported a failure' }
    if (!(Test-Path (Join-Path $ReportDirectory 'wack.xml'))) { throw 'Missing WACK report' }
    [xml]$report = Get-Content (Join-Path $ReportDirectory 'wack.xml') -Raw
    $overall = $report.SelectSingleNode('//*[@OVERALL_RESULT]')
    if (!$overall -or $overall.GetAttribute('OVERALL_RESULT') -ne 'PASS') { throw 'WACK report does not establish an overall pass' }
  }
} finally {
  if ($installed) {
    Get-Process tuturuuu -ErrorAction SilentlyContinue | Where-Object { $_.Path.StartsWith($installed.InstallLocation) } | Stop-Process -ErrorAction SilentlyContinue
    Remove-AppxPackage -Package $installed.PackageFullName -ErrorAction SilentlyContinue
  }
  if ($certificate) {
    Remove-Item "Cert:\LocalMachine\TrustedPeople\$($certificate.Thumbprint)" -ErrorAction SilentlyContinue
    Remove-Item "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -ErrorAction SilentlyContinue
  }
  Remove-Item $temporary -Recurse -Force
}
