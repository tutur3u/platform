import type { ProviderCreateMetadata } from './create-metadata';

/** Only an authoritative matching receipt permits the subsequent original trim.
 * Pending or lost create responses retain the same replacement identity. */
export function verifyGraphAttendeePrivacy(
  event: Record<string, unknown>,
  metadata: ProviderCreateMetadata | undefined
) {
  if (metadata?.provider !== 'microsoft') return;
  const expected = metadata.fields.hideAttendees;
  if (expected !== undefined && event.hideAttendees !== expected)
    throw new Error('Outlook attendee privacy receipt unavailable');
}
