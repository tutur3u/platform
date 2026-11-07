import { afterEach, describe, expect, it, vi } from 'vitest';
import { missingMeetSecrets, refuseMeetRequest } from './worker-admission';

const env = {
  GOOGLE_GENERATIVE_AI_API_KEY: 'fixture',
  MEET_REALTIME_TOKEN_SECRET: 'fixture',
  NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture',
  NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test',
  NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
  SUPABASE_SECRET_KEY: 'fixture',
};
const request = (host: string) => new Request(`https://${host}/`);

describe('Meet Worker admission', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serves the configured origins', () => {
    expect(refuseMeetRequest(request('meet.tuturuuu.com'), env)).toBeNull();
    expect(refuseMeetRequest(request('tuturuuu.com'), env)).toBeNull();
  });

  it.each(['tuturuuu-meet.example.workers.dev', 'evil.example', '127.0.0.1'])(
    'rejects the unknown host %s',
    (host) => {
      expect(refuseMeetRequest(request(host), env)?.status).toBe(404);
    }
  );

  it.each(['SUPABASE_SECRET_KEY', 'MEET_REALTIME_TOKEN_SECRET'])(
    'refuses to serve without %s and hides the name from the response',
    async (name) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const response = refuseMeetRequest(request('meet.tuturuuu.com'), {
        ...env,
        [name]: ' ',
      });
      expect(response?.status).toBe(503);
      expect(await response?.text()).not.toContain(name);
      expect(log).toHaveBeenCalledOnce();
    }
  );

  it('requires the denylist only once Meet AI is explicitly on', () => {
    const name = 'MEET_AI_DISABLED_WORKSPACE_IDS';
    expect(missingMeetSecrets({ ...env, MEET_AI_DISABLED: 'true' })).toEqual([]);
    expect(missingMeetSecrets({ ...env, MEET_AI_DISABLED: 'false' })).toEqual([
      name,
    ]);
    expect(
      missingMeetSecrets({ ...env, MEET_AI_DISABLED: '0', [name]: 'fixture' })
    ).toEqual([]);
  });
});
