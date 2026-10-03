import type { calendar_v3 } from '@tuturuuu/google';
import type {
  GoogleProviderColorChoice,
  GoogleProviderColorOptions,
} from '@tuturuuu/types/primitives/google-calendar-color';
import { Effect } from '@tuturuuu/utils/effect';
import type { GoogleColorContext } from '@tuturuuu/utils/google-calendar-colors';
import {
  opaqueGoogleColor,
  resolveGoogleEventColor,
} from '@tuturuuu/utils/google-calendar-colors';
import { z } from 'zod';
import type { ResolvedCalendarSource } from './source-resolver';

export class GoogleColorChoiceError extends Error {
  constructor(
    message: string,
    readonly status: number = 400
  ) {
    super(message);
  }
}
export const GoogleProviderColorChoiceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      connectionId: z.guid(),
      kind: z.literal('inherit'),
      id: z.null().optional(),
    })
    .strict(),
  z
    .object({
      connectionId: z.guid(),
      kind: z.literal('event'),
      id: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({ connectionId: z.guid(), kind: z.literal('label'), id: z.guid() })
    .strict(),
]);

function providerChoiceFailure(failure: unknown, message: string) {
  const error = failure as {
    code?: unknown;
    response?: { status?: unknown };
  } | null;
  const status = Number(error?.response?.status ?? error?.code);
  return new GoogleColorChoiceError(
    message,
    [401, 403].includes(status) ? status : 503
  );
}

/** All definitions must be current before a selectable/writeable choice is offered. */
export async function loadGoogleColorOptions(
  calendar: calendar_v3.Calendar,
  source: ResolvedCalendarSource
) {
  if (source.provider !== 'google' || !source.connectionId)
    throw new GoogleColorChoiceError('Google calendar source is required');
  const calendarId = source.externalCalendarId;
  const result = await Effect.runPromise(
    Effect.either(
      Effect.all(
        [
          Effect.tryPromise({
            try: () => calendar.colors.get(),
            catch: (failure) =>
              providerChoiceFailure(
                failure,
                'Google color palette is unavailable'
              ),
          }),
          Effect.tryPromise({
            try: () => calendar.calendarList.get({ calendarId }),
            catch: (failure) =>
              providerChoiceFailure(
                failure,
                'Google source color is unavailable'
              ),
          }),
          Effect.tryPromise({
            try: () => calendar.calendars.get({ calendarId }),
            catch: (failure) =>
              providerChoiceFailure(
                failure,
                'Google calendar labels are unavailable'
              ),
          }),
        ],
        { concurrency: 3 }
      )
    )
  );
  if (result._tag === 'Left') throw result.left;
  const [palette, entry, details] = result.right;
  if (entry.data.accessRole !== 'owner' && entry.data.accessRole !== 'writer')
    throw new GoogleColorChoiceError(
      'Google calendar source is no longer writable',
      403
    );
  if (!palette.data.event || Object.keys(palette.data.event).length === 0)
    throw new GoogleColorChoiceError(
      'Google event color palette is unavailable',
      502
    );
  const sourceDefinition = entry.data.colorId
    ? palette.data.calendar?.[entry.data.colorId]
    : undefined;
  const background =
    opaqueGoogleColor(entry.data.backgroundColor) ??
    opaqueGoogleColor(sourceDefinition?.background);
  if (!background)
    throw new GoogleColorChoiceError('Google source color is unresolved', 502);
  const context: GoogleColorContext = {
    calendarId,
    calendarBackground: background,
    calendarForeground:
      opaqueGoogleColor(entry.data.foregroundColor) ??
      opaqueGoogleColor(sourceDefinition?.foreground),
    eventColors: palette.data.event,
    eventLabels: details.data.labelProperties?.eventLabels ?? undefined,
  };
  const options: GoogleProviderColorOptions = {
    provider: 'google',
    connectionId: source.connectionId,
    calendarId,
    sourceColor: { background, foreground: context.calendarForeground ?? null },
    options: [
      {
        kind: 'inherit',
        id: null,
        name: null,
        background,
        foreground: context.calendarForeground ?? null,
      },
    ],
  };
  for (const [id, color] of Object.entries(context.eventColors ?? {})) {
    const rgb = opaqueGoogleColor(color.background);
    if (rgb)
      options.options.push({
        kind: 'event',
        id,
        name: null,
        background: rgb,
        foreground: opaqueGoogleColor(color.foreground),
      });
  }
  for (const label of details.data.labelProperties?.eventLabels ?? []) {
    const rgb = opaqueGoogleColor(label.backgroundColor);
    if (label.id && rgb)
      options.options.push({
        kind: 'label',
        id: label.id,
        name: label.name ?? null,
        background: rgb,
        foreground: null,
      });
  }
  return { options, context };
}
export async function resolveGoogleColorChoice(
  calendar: calendar_v3.Calendar,
  source: ResolvedCalendarSource,
  choice: GoogleProviderColorChoice
) {
  if (
    source.provider !== 'google' ||
    source.connectionId !== choice.connectionId
  ) {
    throw new GoogleColorChoiceError(
      'Color choice does not belong to the selected Google calendar'
    );
  }
  const { options, context } = await loadGoogleColorOptions(calendar, source);
  const option = options.options.find(
    (candidate) =>
      candidate.kind === choice.kind &&
      (choice.kind === 'inherit' || candidate.id === choice.id)
  );
  if (!option)
    throw new GoogleColorChoiceError(
      'Google color choice is no longer available',
      409
    );
  const fields: Pick<calendar_v3.Schema$Event, 'colorId' | 'eventLabelId'> =
    choice.kind === 'label'
      ? { eventLabelId: choice.id, colorId: '' }
      : choice.kind === 'event'
        ? { colorId: choice.id, eventLabelId: '' }
        : { colorId: '', eventLabelId: '' };
  return {
    fields,
    metadata: resolveGoogleEventColor(fields, context),
    sourceBackground: options.sourceColor.background,
  };
}
