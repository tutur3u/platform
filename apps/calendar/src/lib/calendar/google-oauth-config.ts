export type GoogleCalendarOAuthConfig = {
  clientId: string;
  clientSecret: string;
};

export function getGoogleCalendarOAuthConfig():
  | { ok: true; config: GoogleCalendarOAuthConfig }
  | { ok: false } {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return { ok: false };
  }

  return {
    ok: true,
    config: { clientId, clientSecret },
  };
}
