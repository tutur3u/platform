param([Parameter(Mandatory=$true)][string]$Package, [Parameter(Mandatory=$true)][string]$ReportDirectory, [switch]$DiagnosticsOnly)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'store-certification-gate.ps1')
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
  $receiptPaths = @(
    (Join-Path $env:LOCALAPPDATA 'Tuturuuu/desktop-smoke.txt'),
    (Join-Path $env:LOCALAPPDATA "Packages/$($installed.PackageFamilyName)/LocalCache/Local/Tuturuuu/desktop-smoke.txt")
  )
  $receiptPaths | ForEach-Object { Remove-Item -LiteralPath $_ -ErrorAction SilentlyContinue }
  Start-Process 'com.tuturuuu.app.mobile://login-callback?desktop_smoke=1'
  $receipt = $null
  $receiptDeadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 500
    $receipt = $receiptPaths | Where-Object { (Test-Path -LiteralPath $_) -and (Get-Content -LiteralPath $_ -Raw) -eq 'desktop_smoke=1' } | Select-Object -First 1
  } while (!$receipt -and (Get-Date) -lt $receiptDeadline)
  if (!$receipt) { throw 'App did not acknowledge desktop_smoke=1 through its platform link handler' }
  Copy-Item -LiteralPath $receipt -Destination (Join-Path $ReportDirectory 'uri-receipt.txt')
  Start-Sleep -Seconds 3
  $app.Refresh()
  if ($app.HasExited -or $app.MainWindowHandle -eq 0) { throw 'Installed app failed URI activation' }
  # Capture only this fresh, signed-out app window for visual validation/listing review.
  Add-Type -AssemblyName System.Drawing
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TuturuuuWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("shcore.dll")] public static extern int GetProcessDpiAwareness(IntPtr process, out int awareness);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowDpiAwarenessContext(IntPtr window);
  [DllImport("user32.dll")] public static extern bool AreDpiAwarenessContextsEqual(IntPtr first, IntPtr second);
}
'@
  # Diagnose the built, installed process, not only the source manifest. This
  # receipt is not a substitute for a passing certification report.
  $awareness = -1
  $dpiResult = [TuturuuuWindowCapture]::GetProcessDpiAwareness($app.Handle, [ref]$awareness)
  $windowContext = [TuturuuuWindowCapture]::GetWindowDpiAwarenessContext($app.MainWindowHandle)
  $perMonitorV2 = [TuturuuuWindowCapture]::AreDpiAwarenessContextsEqual($windowContext, [IntPtr]::new(-4))
  "processDpiQuerySucceeded=$($dpiResult -eq 0)`nprocessDpiAwareness=$awareness`nwindowPerMonitorV2=$perMonitorV2" | Set-Content (Join-Path $ReportDirectory 'dpi-awareness.txt')
  $manifestTool = Get-ChildItem $sdkRoot -Filter mt.exe -Recurse | Where-Object { $_.Directory.Name -eq 'x64' } | Sort-Object FullName -Descending | Select-Object -First 1
  if ($manifestTool) {
    $manifestReceipt = Join-Path $ReportDirectory 'embedded-executable.manifest'
    & $manifestTool.FullName "-inputresource:$($app.Path);#1" "-out:$manifestReceipt" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      'Unavailable: Windows SDK could not extract the installed executable manifest.' | Set-Content (Join-Path $ReportDirectory 'embedded-manifest-unavailable.txt')
    }
  } else {
    'Unavailable: Windows SDK manifest tool not found.' | Set-Content (Join-Path $ReportDirectory 'embedded-manifest-unavailable.txt')
  }
  [TuturuuuWindowCapture]::SetForegroundWindow($app.MainWindowHandle) | Out-Null
  Start-Sleep -Seconds 2
  if ([TuturuuuWindowCapture]::GetForegroundWindow() -ne $app.MainWindowHandle) { throw 'App is not foreground; refusing to capture another window' }
  $rect = New-Object TuturuuuWindowCapture+Rect
  if (![TuturuuuWindowCapture]::GetWindowRect($app.MainWindowHandle, [ref]$rect)) { throw 'Cannot locate app window for visual validation' }
  $bitmap = New-Object Drawing.Bitmap ($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    $bitmap.Save((Join-Path $ReportDirectory 'windows-first-frame.png'), [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
  'Installed identity, first-frame window, and harmless URI activation passed. Authentication and Store upgrade still need device testing.' | Set-Content (Join-Path $ReportDirectory 'runtime.txt')
  Stop-Process -Id $app.Id
  $wack = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\App Certification Kit\appcert.exe'
  if (Test-WindowsStoreCertificationPrerequisites -KitPath $wack -SessionId ([Diagnostics.Process]::GetCurrentProcess().SessionId) -ReportDirectory $ReportDirectory -DiagnosticsOnly:$DiagnosticsOnly) {
    & $wack reset
    & $wack test -packagefullname $installed.PackageFullName -reportoutputpath (Join-Path $ReportDirectory 'wack.xml')
    if ($LASTEXITCODE -ne 0) { throw 'Windows App Certification Kit reported a failure' }
    if (!(Test-Path (Join-Path $ReportDirectory 'wack.xml'))) { throw 'Missing WACK report' }
    [xml]$report = Get-Content (Join-Path $ReportDirectory 'wack.xml') -Raw
    $overall = $report.SelectSingleNode('//*[@OVERALL_RESULT]')
    $summary = @(if ($overall) { "overall=$($overall.GetAttribute('OVERALL_RESULT'))" } else { 'overall=UNKNOWN' })
    foreach ($test in $report.SelectNodes('//TEST')) {
      $result = $test.SelectSingleNode('RESULT')
      if ($result -and $result.InnerText.Trim() -ne 'PASS') {
        $summary += "$($test.GetAttribute('NAME')) | optional=$($test.GetAttribute('OPTIONAL')) | result=$($result.InnerText.Trim())"
      }
    }
    $summary | Set-Content (Join-Path $ReportDirectory 'wack-summary.txt')
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
