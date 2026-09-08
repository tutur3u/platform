/** Long-lived TURN keys stay in the Worker; clients receive expiring credentials. */
export interface TurnEnv {
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_API_TOKEN?: string;
}

export type IceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

/** Do not offer port 53: browsers restrict it. Include TLS/443 for blocked UDP. */
export async function generateTurnCredentials(
  env: TurnEnv,
  request: typeof fetch = fetch
): Promise<IceServer[]> {
  if (!env.CLOUDFLARE_TURN_KEY_ID || !env.CLOUDFLARE_TURN_API_TOKEN)
    throw new Error('turn_not_configured');
  let response: Response;
  try {
    response = await request(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 86400 }),
        signal: AbortSignal.timeout(5000),
      }
    );
  } catch {
    throw new Error('turn_credentials_unavailable');
  }
  if (!response.ok) throw new Error('turn_credentials_unavailable');
  try {
    const data = (await response.json()) as { iceServers?: IceServer[] };
    const servers = data.iceServers?.map((server) => ({
      urls: server.urls.filter((url) => !/:53(?:\?|$)/.test(url)),
      ...(server.username && server.credential
        ? { username: server.username, credential: server.credential }
        : {}),
    }));
    if (
      !servers?.some(
        (server) =>
          server.username &&
          server.credential &&
          server.urls.some(
            (url) => url === 'turns:turn.cloudflare.com:443?transport=tcp'
          )
      )
    )
      throw new Error('invalid_turn_response');
    return servers.filter((server) => server.urls.length);
  } catch {
    // Never expose upstream payloads, credentials, or authorization headers.
    throw new Error('turn_credentials_unavailable');
  }
}

/** Relay outages must not disable callers whose direct ICE path still works. */
export async function getSessionIceServers(
  env: TurnEnv,
  request: typeof fetch = fetch
) {
  try {
    return await generateTurnCredentials(env, request);
  } catch {
    console.warn('Meet TURN credentials unavailable; using direct ICE');
    return undefined;
  }
}
