import { describe, expect, it, vi } from 'vitest';
import {
  createNotesVoiceJob,
  deleteNotesVoiceJob,
  getNotesVoiceJob,
} from './notes-voice';

const response = () =>
  new Response('{}', { headers: { 'content-type': 'application/json' } });
describe('Notes voice first-class API client', () => {
  it('posts WAV, stable intent and explicit retry revision without JSON/multipart content-type corruption', async () => {
    const fetch = vi.fn().mockImplementation(async () => response());
    await createNotesVoiceJob(
      'ws/one',
      {
        audio: new Blob(['fixture'], { type: 'audio/wav' }),
        requestId: 'intent',
        timezone: 'UTC',
        expectedRevision: 4,
      },
      {
        fetch,
        baseUrl: 'https://api.example',
        defaultHeaders: { Authorization: 'Bearer fixture' },
      }
    );
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(
      'https://api.example/api/v1/workspaces/ws%2Fone/notes/voice-jobs'
    );
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('requestId')).toBe('intent');
    expect(init.body.get('expectedRevision')).toBe('4');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer fixture'
    );
    expect(new Headers(init.headers).get('content-type')).toBeNull();
  });
  it('scopes status and artifact deletion to encoded job/workspace identities', async () => {
    const fetch = vi.fn().mockImplementation(async () => response());
    await getNotesVoiceJob('ws/one', 'job/two', {
      fetch,
      baseUrl: 'https://api.example',
    });
    await deleteNotesVoiceJob('ws/one', 'job/two', {
      fetch,
      baseUrl: 'https://api.example',
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://api.example/api/v1/workspaces/ws%2Fone/notes/voice-jobs/job%2Ftwo'
    );
    expect(fetch.mock.calls[1]?.[1].method).toBe('DELETE');
  });
});
