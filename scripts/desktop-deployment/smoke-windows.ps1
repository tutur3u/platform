$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (!$env:RUNNER_TEMP -or !$env:GITHUB_RUN_ID) { throw 'CI runner required' }
foreach ($name in @('ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_RUNTIME_TOKEN')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}
$artifacts = Join-Path $env:RUNNER_TEMP 'desktop-artifacts'
$installer = Join-Path $artifacts 'Tuturuuu-windows-x64-setup.exe'
$installerSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$receipt = Get-Content (Join-Path $artifacts 'verified-windows.json') -Raw | ConvertFrom-Json
if ($receipt.sha256 -ne $installerSha256 -or $receipt.source -ne $env:GITHUB_SHA -or $receipt.run -ne $env:GITHUB_RUN_ID) {
    throw 'Installer does not match the exact-source packaging receipt'
}
$installRoot = Join-Path $env:RUNNER_TEMP "tuturuuu-smoke-$([guid]::NewGuid())"
$process = $null
$setup = $null
$originalError = $null
$cleanupErrors = @()
function Wait-SmokeInstaller($Child, $Phase) {
    if (!$Child.WaitForExit(120000)) {
        try {
            $Child.Kill($true)
            if (!$Child.WaitForExit(10000)) { Write-Warning "$Phase did not stop within 10 seconds" }
        } catch { Write-Warning "$Phase timeout cleanup failed: $($_.Exception.Message)" }
        throw "$Phase timed out after 120 seconds"
    }
    if ($Child.ExitCode -ne 0) { throw "$Phase failed: $($Child.ExitCode)" }
}
try {
    $setup = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', "/DIR=`"$installRoot`"") -PassThru
    Wait-SmokeInstaller $setup 'Installer'
    foreach ($relative in @('tuturuuu.exe', 'flutter_windows.dll', 'data\icudtl.dat', 'data\app.so', 'data\flutter_assets')) {
        if (!(Test-Path (Join-Path $installRoot $relative))) { throw "Installed bundle missing $relative" }
    }
    $files = @(Get-ChildItem -LiteralPath $installRoot -Recurse -File -Force | ForEach-Object {
        $relative = [IO.Path]::GetRelativePath($installRoot, $_.FullName)
        if ($relative -notmatch '^(tuturuuu\.exe|[^\\/]+\.dll|data[\\/](icudtl\.dat|app\.so|flutter_assets[\\/].+)|unins000\.(exe|dat|msg))$') {
            throw "Unexpected installed file: $relative"
        }
        if ($relative -match '^data[\\/]' -and ($relative -match '[\\/]\.env(?:\.|$)' -or $relative -match '\.(exe|pdb|lib|exp|ilk|env|p12|pfx|pem|key|p8|jks|keystore|mobileprovision|provisionprofile)$')) {
            throw "Unexpected installed file type: $relative"
        }
        [ordered]@{ name = $relative; bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
    $process = Start-Process -FilePath (Join-Path $installRoot 'tuturuuu.exe') -WorkingDirectory $installRoot -PassThru
    Start-Sleep -Seconds 15
    $process.Refresh()
    if ($process.HasExited) { throw "Installed app exited during startup: $($process.ExitCode)" }
    if ($process.MainWindowHandle -eq 0) { throw 'Installed app did not render its first frame' }
    if ($process.MainWindowTitle -cne 'Tuturuuu') { throw 'Installed app main window title is not Tuturuuu' }
    [ordered]@{
        windowTitle = $process.MainWindowTitle
        source = $env:GITHUB_SHA
        run = $env:GITHUB_RUN_ID
        attempt = $env:GITHUB_RUN_ATTEMPT
        installerSha256 = $installerSha256
        verification = 'installed-first-frame-visible-15s'
        files = $files
    } | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $env:RUNNER_TEMP 'windows-installed-files.json') -Encoding utf8
} catch {
    $originalError = $_
} finally {
    try {
        if ($process -and !$process.HasExited) {
            Stop-Process -Id $process.Id -Force
            if (!$process.WaitForExit(10000)) { throw 'App did not stop before uninstall' }
        }
    } catch { $cleanupErrors += $_ }
    try {
        if ($setup -and !$setup.HasExited) { throw 'Installer is still running; uninstall skipped' }
        $uninstaller = Join-Path $installRoot 'unins000.exe'
        if (Test-Path $uninstaller) {
            $uninstall = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -PassThru
            Wait-SmokeInstaller $uninstall 'Uninstaller'
        }
    } catch { $cleanupErrors += $_ }
}
if ($originalError) {
    foreach ($failure in $cleanupErrors) { Write-Warning "Cleanup also failed: $($failure.Exception.Message)" }
    throw $originalError
}
if ($cleanupErrors.Count -gt 0) { throw $cleanupErrors[0] }
