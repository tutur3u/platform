param([Parameter(Mandatory=$true)][string]$Bundle, [Parameter(Mandatory=$true)][string]$Output, [Parameter(Mandatory=$true)][string]$Version)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+\.0$' -or ($Version.Split('.') | Where-Object { [long]$_ -gt 65535 })) { throw 'Invalid Store package version' }
$stage = Join-Path ([IO.Path]::GetTempPath()) ('tuturuuu-msix-' + [Guid]::NewGuid())
try {
  New-Item -ItemType Directory -Path $stage | Out-Null
  Copy-Item -Path (Join-Path $Bundle '*') -Destination $stage -Recurse
  if (!(Test-Path (Join-Path $stage 'tuturuuu.exe'))) { throw 'Missing Windows executable' }
  $manifest = Get-Content (Join-Path $PSScriptRoot 'windows-store-manifest.xml') -Raw
  $manifest.Replace('__PACKAGE_VERSION__', $Version) | Set-Content (Join-Path $stage 'AppxManifest.xml') -Encoding utf8
  New-Item -ItemType Directory -Path (Join-Path $stage 'Assets') | Out-Null
  Add-Type -AssemblyName System.Drawing
  $source = [Drawing.Image]::FromFile((Resolve-Path 'apps/mobile/assets/app_icon.png'))
  try {
    foreach ($logo in @{ StoreLogo = 50; Square150x150Logo = 150; Square44x44Logo = 44 }.GetEnumerator()) {
      $bitmap = New-Object Drawing.Bitmap($logo.Value, $logo.Value)
      $graphics = [Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($source, 0, 0, $logo.Value, $logo.Value)
        $bitmap.Save((Join-Path $stage ('Assets\' + $logo.Key + '.png')), [Drawing.Imaging.ImageFormat]::Png)
      } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
  } finally { $source.Dispose() }
  $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  $makeappx = Get-ChildItem $sdkRoot -Filter makeappx.exe -Recurse | Where-Object { $_.Directory.Name -eq 'x64' } | Sort-Object FullName -Descending | Select-Object -First 1
  if (!$makeappx) { throw 'Windows SDK MakeAppx required' }
  New-Item -ItemType Directory -Path $Output -Force | Out-Null
  & $makeappx.FullName pack /d $stage /p (Join-Path $Output 'Tuturuuu-windows-store-x64.msix') /o
  if ($LASTEXITCODE -ne 0) { throw 'MSIX validation failed' }
} finally { if (Test-Path $stage) { Remove-Item $stage -Recurse -Force } }
