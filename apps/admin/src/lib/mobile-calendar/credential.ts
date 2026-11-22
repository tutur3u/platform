export function isCalendarGatewayCredential(value: string) {
  return /^[a-zA-Z0-9_-]{43,}$/.test(value);
}

export class CalendarGatewayCredentialError extends Error {
  constructor(
    readonly reason:
      | 'invalid-binding'
      | 'envelope-read'
      | 'envelope-missing'
      | 'envelope-invalid'
      | 'envelope-decrypt'
      | 'credential-invalid'
  ) {
    super('Calendar gateway credential unavailable');
  }
}
