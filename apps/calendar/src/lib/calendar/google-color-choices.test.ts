import type { calendar_v3 } from '@tuturuuu/google';
import { describe, expect, it, vi } from 'vitest';
import {
  GoogleColorChoiceError,
  GoogleProviderColorChoiceSchema,
  loadGoogleColorOptions,
  resolveGoogleColorChoice,
} from './google-color-choices';

const source = {
  provider: 'google' as const,
  connectionId: '00000000-0000-4000-8000-000000000001',
  workspaceCalendarId: null,
  externalCalendarId: 'source',
  accessRole: 'owner',
  accountEmail: null,
  accountName: null,
  label: 'Source',
  color: '#old',
  accessToken: 'test',
};
const labelId = '00000000-0000-4000-8000-000000000002';
function calendar() {
  return {
    colors: {
      get: vi.fn().mockResolvedValue({
        data: {
          event: Object.fromEntries(
            Array.from({ length: 11 }, (_, index) => [
              String(index + 1),
              { background: '#039be5', foreground: '#ffffff' },
            ])
          ),
          calendar: { '1': { background: '#9fc6e7' } },
        },
      }),
    },
    calendarList: {
      get: vi.fn().mockResolvedValue({
        data: {
          colorId: '1',
          backgroundColor: '#d06b64',
          accessRole: 'owner',
          foregroundColor: '#000000',
        },
      }),
    },
    calendars: {
      get: vi.fn().mockResolvedValue({
        data: {
          labelProperties: {
            eventLabels: [
              { id: labelId, name: 'Custom', backgroundColor: '#123ABC' },
            ],
          },
        },
      }),
    },
  } as unknown as calendar_v3.Calendar;
}
describe('validated Google colors', () => {
  it('returns inherited custom RGB, all11 live event IDs and real scoped labels', async () => {
    const { options } = await loadGoogleColorOptions(calendar(), source);
    expect(options.sourceColor.background).toBe('#d06b64');
    expect(options.options).toHaveLength(13);
    expect(
      options.options
        .filter((option) => option.kind === 'event')
        .map((option) => option.id)
    ).toEqual(Array.from({ length: 11 }, (_, i) => String(i + 1)));
    expect(options.options.at(-1)).toMatchObject({
      kind: 'label',
      id: labelId,
      name: 'Custom',
      background: '#123abc',
    });
  });
  it.each([
    { kind: 'inherit' as const },
    { kind: 'event' as const, id: '7' },
    { kind: 'label' as const, id: labelId },
  ])(
    'resolves identity and inherited intent from current server definitions',
    async (choice) => {
      const result = await resolveGoogleColorChoice(calendar(), source, {
        ...choice,
        connectionId: source.connectionId,
      });
      expect(result.metadata.resolution).toBe(
        choice.kind === 'inherit' ? 'calendar' : choice.kind
      );
      expect(result.metadata.inherited).toBe(choice.kind === 'inherit');
    }
  );
  it('rejects a choice from another source before metadata reads', async () => {
    const client = calendar();
    await expect(
      resolveGoogleColorChoice(client, source, {
        connectionId: 'other',
        kind: 'event',
        id: '7',
      })
    ).rejects.toThrow('does not belong');
    expect(client.colors.get).not.toHaveBeenCalled();
  });
  it('rejects deleted/unknown choices instead of substituting native fallback', async () => {
    await expect(
      resolveGoogleColorChoice(calendar(), source, {
        connectionId: source.connectionId,
        kind: 'event',
        id: 'unknown',
      })
    ).rejects.toMatchObject({ status: 409 });
  });
  it('reports provider availability failures as typed errors', async () => {
    const client = calendar();
    vi.mocked(client.calendars.get).mockRejectedValueOnce(
      new Error('unavailable')
    );
    await expect(loadGoogleColorOptions(client, source)).rejects.toBeInstanceOf(
      GoogleColorChoiceError
    );
  });
  it('rejects a connection whose current Google access became read-only', async () => {
    const client = calendar();
    vi.mocked(client.calendarList.get).mockResolvedValueOnce({
      data: { accessRole: 'reader', backgroundColor: '#d06b64' },
    } as never);
    await expect(loadGoogleColorOptions(client, source)).rejects.toMatchObject({
      status: 403,
    });
  });
  it('never accepts arbitrary RGB, label arrays or metadata commands', () => {
    for (const choice of [
      {
        connectionId: source.connectionId,
        kind: 'event',
        id: '7',
        background: '#ffffff',
      },
      { connectionId: source.connectionId, kind: 'inherit', id: '7' },
      { connectionId: source.connectionId, kind: 'label', id: 'bad' },
      {
        connectionId: source.connectionId,
        kind: 'event',
        id: '7',
        google_color: {},
      },
    ])
      expect(GoogleProviderColorChoiceSchema.safeParse(choice).success).toBe(
        false
      );
  });
});
