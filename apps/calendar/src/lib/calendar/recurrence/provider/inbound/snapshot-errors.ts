import { UnsupportedCalendarRecurrenceError } from '@tuturuuu/utils/calendar-recurrence';
/** Only an authoritative GET of the requested master may produce this signal. */
export class ProviderSeriesDeletedError extends Error {
  constructor() {
    super('Provider recurring master deleted');
    this.name = 'ProviderSeriesDeletedError';
  }
}

/** Only a complete revision-verified snapshot may carry unsupported raw rules. */
export class ProviderSeriesUnsupportedError extends UnsupportedCalendarRecurrenceError {
  constructor(
    readonly snapshot: {
      provider: 'google' | 'microsoft';
      masterId: string;
      etag: string;
      master: Record<string, unknown>;
      exceptions: Record<string, unknown>[];
    }
  ) {
    super('Provider recurrence requires read-only projection');
    this.name = 'ProviderSeriesUnsupportedError';
  }
}
