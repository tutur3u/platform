export type MailProvider = 'google' | 'microsoft';
export const scopes = {
  google: ['https://www.googleapis.com/auth/gmail.modify'],
  microsoft: ['offline_access', 'User.Read', 'Mail.ReadWrite', 'Mail.Send'],
};

export function providerConfig(provider: MailProvider) {
  const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT';
  const clientId = process.env[`MAIL_${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`MAIL_${prefix}_CLIENT_SECRET`];
  const redirectUri = process.env[`MAIL_${prefix}_REDIRECT_URI`];
  if (!clientId || !clientSecret || !redirectUri)
    throw new Error('Mail OAuth is not configured');
  const base = 'https://login.microsoftonline.com/common/oauth2/v2.0';
  return {
    clientId,
    clientSecret,
    redirectUri,
    authorize:
      provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : `${base}/authorize`,
    token:
      provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : `${base}/token`,
  };
}

export class ConnectedMailError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
