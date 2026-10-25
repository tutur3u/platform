$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (!$env:RUNNER_TEMP -or !$env:GITHUB_RUN_ID) { throw 'CI runner required' }
$artifacts = Join-Path $env:RUNNER_TEMP 'desktop-artifacts'
$installer = Join-Path $artifacts 'Tuturuuu-windows-x64-setup.exe'
$installRoot = Join-Path $env:RUNNER_TEMP "tuturuuu-smoke-$([guid]::NewGuid())"
$process = $null
try {
    $setup = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', "/DIR=`"$installRoot`"") -Wait -PassThru
    if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
    foreach ($relative in @('tuturuuu.exe', 'flutter_windows.dll', 'data\icudtl.dat', 'data\app.so', 'data\flutter_assets')) {
        if (!(Test-Path (Join-Path $installRoot $relative))) { throw "Installed bundle missing $relative" }
    }
    $files = @(Get-ChildItem $installRoot -Recurse -File | ForEach-Object {
        [ordered]@{ name = [IO.Path]::GetRelativePath($installRoot, $_.FullName); bytes = $_.Length }
    })
    $process = Start-Process -FilePath (Join-Path $installRoot 'tuturuuu.exe') -WorkingDirectory $installRoot -PassThru
    Start-Sleep -Seconds 15
    $process.Refresh()
    if ($process.HasExited) { throw "Installed app exited during startup: $($process.ExitCode)" }
    if ($process.MainWindowHandle -eq 0) { throw 'Installed app did not create a window' }
    [ordered]@{
        source = $env:GITHUB_SHA
        run = $env:GITHUB_RUN_ID
        verification = 'installed-window-opened-15s'
        files = $files
    } | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $artifacts 'windows-installed-files.json') -Encoding utf8
} finally {
    if ($process -and !$process.HasExited) { Stop-Process -Id $process.Id -Force }
    $uninstaller = Join-Path $installRoot 'unins000.exe'
    if (Test-Path $uninstaller) {
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -Wait -PassThru
        if ($uninstall.ExitCode -ne 0) { throw "Uninstaller failed: $($uninstall.ExitCode)" }
    }
}
