/** Shared pure signing allowlist; native CI imports this checkout file directly. */
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
