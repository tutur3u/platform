param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
if (-not $env:WINDOWS_SIGNING_CERTIFICATE_PFX_B64 -or -not $env:WINDOWS_SIGNING_CERTIFICATE_PASSWORD) {
  throw 'Windows publication requires a trusted code-signing certificate in the desktop-beta environment.'
}
$certificatePath = Join-Path $env:RUNNER_TEMP 'desktop-signing.pfx'
$certificate = $null
try {
  [IO.File]::WriteAllBytes($certificatePath, [Convert]::FromBase64String($env:WINDOWS_SIGNING_CERTIFICATE_PFX_B64))
  $password = ConvertTo-SecureString $env:WINDOWS_SIGNING_CERTIFICATE_PASSWORD -AsPlainText -Force
  $certificates = @(Import-PfxCertificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\My -Password $password | Where-Object { $_.HasPrivateKey })
  if ($certificates.Count -ne 1) { throw 'Expected exactly one signing key' }
  $certificate = $certificates[0]
  $files = if (Test-Path -Path $Path -PathType Container) {
    Get-ChildItem -Path $Path -Recurse -File | Where-Object { $_.Extension -in '.exe', '.dll' }
  } else { @(Get-Item $Path) }
  if ($files.Count -eq 0) { throw 'No binaries to sign' }
  foreach ($file in $files) {
    $result = Set-AuthenticodeSignature -FilePath $file.FullName -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer 'http://timestamp.digicert.com'
    if ($result.Status -ne 'Valid') { throw 'Windows signature validation failed' }
    $verified = Get-AuthenticodeSignature -FilePath $file.FullName
    if ($verified.Status -ne 'Valid' -or $verified.SignerCertificate.Thumbprint -ne $certificate.Thumbprint -or -not $verified.TimeStamperCertificate) {
      throw 'Windows signature verification failed'
    }
  }
} finally {
  Remove-Item $certificatePath -Force -ErrorAction SilentlyContinue
  if ($certificate) { Remove-Item "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -DeleteKey -Force -ErrorAction SilentlyContinue }
}
