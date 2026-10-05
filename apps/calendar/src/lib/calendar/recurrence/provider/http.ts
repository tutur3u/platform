import { UnsupportedCalendarRecurrenceError } from '@tuturuuu/utils/calendar-recurrence';
import { ZodError } from 'zod';
import { seriesFailure } from '../http';
import { CalendarSeriesError } from '../service';
export function providerOperationFailure(error: unknown) {
  if (
    error instanceof CalendarSeriesError ||
    error instanceof ZodError ||
    error instanceof RangeError
  )
    return seriesFailure(error);
  if (error instanceof UnsupportedCalendarRecurrenceError)
    return seriesFailure(
      new CalendarSeriesError(error.message, 422, 'PROVIDER_RULE_UNSUPPORTED')
    );
  // SDK errors can contain complete authenticated request objects. Do not pass
  // those through the generic series logger or expose provider response bodies.
  console.error('Provider recurrence admission failed');
  return seriesFailure(
    new CalendarSeriesError(
      'Provider recurrence is temporarily unavailable',
      503,
      'PROVIDER_UNAVAILABLE'
    )
  );
}
