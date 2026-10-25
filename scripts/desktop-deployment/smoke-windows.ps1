$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (!$env:RUNNER_TEMP -or !$env:GITHUB_RUN_ID) { throw 'CI runner required' }
foreach ($name in @('ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_RUNTIME_TOKEN')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}
$artifacts = Join-Path $env:RUNNER_TEMP 'desktop-artifacts'
$installer = Join-Path $artifacts 'Tuturuuu-windows-x64-setup.exe'
$installerSha256 = (Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$receipt = Get-Content (Join-Path $artifacts 'verified-windows.json') -Raw | ConvertFrom-Json
if ($receipt.sha256 -ne $installerSha256 -or $receipt.source -ne $env:GITHUB_SHA -or $receipt.run -ne $env:GITHUB_RUN_ID) {
    throw 'Installer does not match the exact-source packaging receipt'
}
$installRoot = Join-Path $env:RUNNER_TEMP "tuturuuu-smoke-$([guid]::NewGuid())"
$process = $null
$originalError = $null
$cleanupErrors = @()
try {
    $setup = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', "/DIR=`"$installRoot`"") -Wait -PassThru
    if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
    foreach ($relative in @('tuturuuu.exe', 'flutter_windows.dll', 'data\icudtl.dat', 'data\app.so', 'data\flutter_assets')) {
        if (!(Test-Path (Join-Path $installRoot $relative))) { throw "Installed bundle missing $relative" }
    }
    $files = @(Get-ChildItem $installRoot -Recurse -File | ForEach-Object {
        $relative = [IO.Path]::GetRelativePath($installRoot, $_.FullName)
        if ($relative -notmatch '^(tuturuuu\.exe|[^\\/]+\.dll|data[\\/].+|unins000\.(exe|dat|msg))$') {
            throw "Unexpected installed file: $relative"
        }
        [ordered]@{ name = $relative; bytes = $_.Length; sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
    $process = Start-Process -FilePath (Join-Path $installRoot 'tuturuuu.exe') -WorkingDirectory $installRoot -PassThru
    Start-Sleep -Seconds 15
    $process.Refresh()
    if ($process.HasExited) { throw "Installed app exited during startup: $($process.ExitCode)" }
    if ($process.MainWindowHandle -eq 0) { throw 'Installed app did not render its first frame' }
    [ordered]@{
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
        $uninstaller = Join-Path $installRoot 'unins000.exe'
        if (Test-Path $uninstaller) {
            $uninstall = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -Wait -PassThru
            if ($uninstall.ExitCode -ne 0) { throw "Uninstaller failed: $($uninstall.ExitCode)" }
        }
    } catch { $cleanupErrors += $_ }
}
if ($originalError) {
    foreach ($failure in $cleanupErrors) { Write-Warning "Cleanup also failed: $($failure.Exception.Message)" }
    throw $originalError
}
if ($cleanupErrors.Count -gt 0) { throw $cleanupErrors[0] }
