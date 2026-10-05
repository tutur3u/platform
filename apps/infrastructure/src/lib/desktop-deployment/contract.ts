/** Desktop signing is a separate trust family; Linux and Store MSIX need no signing bundle. */
export const DESKTOP_DEPLOYMENT_PLATFORMS = ['windows', 'macos'] as const;
export type DesktopDeploymentPlatform =
  (typeof DESKTOP_DEPLOYMENT_PLATFORMS)[number];
export const DESKTOP_DEPLOYMENT_AUDIENCE = 'tuturuuu-desktop-deployment';
export const DESKTOP_DEPLOYMENT_REPOSITORY = 'tutur3u/platform';
export const DESKTOP_DEPLOYMENT_REF = 'refs/heads/production';
export const DESKTOP_DEPLOYMENT_ENVIRONMENT = 'desktop-beta';
export const DESKTOP_DEPLOYMENT_WORKFLOW_REF =
  'tutur3u/platform/.github/workflows/desktop-beta.yaml@refs/heads/production';
export const DESKTOP_DEPLOYMENT_SUBJECT =
  'repo:tutur3u/platform:environment:desktop-beta';
export const DESKTOP_DEPLOYMENT_ISSUER =
  'https://token.actions.githubusercontent.com';

export const DESKTOP_SIGNING_PROFILES = {
  windows: {
    files: ['windows_authenticode_certificate_pfx'],
    scalars: ['WINDOWS_SIGNING_CERTIFICATE_PASSWORD'],
  },
  macos: {
    files: [
      'macos_developer_id_certificate_p12',
      'macos_notarization_private_key_p8',
    ],
    scalars: [
      'MACOS_CERTIFICATE_PASSWORD',
      'MACOS_SIGNING_IDENTITY',
      'APPLE_TEAM_ID',
      'APP_STORE_CONNECT_API_KEY_ID',
      'APP_STORE_CONNECT_ISSUER_ID',
    ],
  },
} as const;
export type DesktopSigningFileKind =
  (typeof DESKTOP_SIGNING_PROFILES)[DesktopDeploymentPlatform]['files'][number];
export type DesktopSigningScalarName =
  (typeof DESKTOP_SIGNING_PROFILES)[DesktopDeploymentPlatform]['scalars'][number];

export class DesktopDeploymentContractError extends Error {
  constructor(public readonly code: string) {
    super('Desktop deployment contract rejected');
    this.name = 'DesktopDeploymentContractError';
  }
}

export function desktopVaultEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export function assertDesktopPlatform(
  value: unknown
): DesktopDeploymentPlatform {
  if (value !== 'windows' && value !== 'macos') {
    throw new DesktopDeploymentContractError('invalid_platform');
  }
  return value;
}

/** Validate an exact platform projection, never forward unknown or other-OS resources. */
export function assertDesktopSigningResources(
  platform: DesktopDeploymentPlatform,
  files: readonly string[],
  scalars: Readonly<Record<string, unknown>>
): void {
  const profile = DESKTOP_SIGNING_PROFILES[assertDesktopPlatform(platform)];
  if (
    files.length !== profile.files.length ||
    new Set(files).size !== files.length ||
    files.some((kind) => !(profile.files as readonly string[]).includes(kind))
  )
    throw new DesktopDeploymentContractError('invalid_signing_files');
  const names = Object.keys(scalars);
  if (
    names.length !== profile.scalars.length ||
    names.some((name) => !(profile.scalars as readonly string[]).includes(name))
  )
    throw new DesktopDeploymentContractError('invalid_signing_scalars');
  for (const name of profile.scalars) {
    const value = scalars[name];
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      new TextEncoder().encode(value).length > 32768 ||
      Array.from(value).some((character) => {
        const code = character.codePointAt(0)!;
        return code < 32 || code === 127;
      })
    )
      throw new DesktopDeploymentContractError('invalid_signing_value');
  }
  if (platform === 'macos') {
    if (
      !(scalars.MACOS_SIGNING_IDENTITY as string).startsWith(
        'Developer ID Application: '
      ) ||
      !/^[A-Z0-9]{10}$/u.test(scalars.APPLE_TEAM_ID as string) ||
      !/^[A-Z0-9]{10}$/u.test(scalars.APP_STORE_CONNECT_API_KEY_ID as string) ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(
        scalars.APP_STORE_CONNECT_ISSUER_ID as string
      )
    )
      throw new DesktopDeploymentContractError('invalid_macos_identity');
  }
}
