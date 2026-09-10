import { decodeMailHeader } from '../address-names';
import { type AnyRecord, privateTable } from './shared';

/** Only fetch original headers for visible messages whose stored names are damaged. */
export async function loadDamagedAddressHeaders(
  admin: AnyRecord,
  rows: AnyRecord[],
  recipientsByMessage: Map<string, AnyRecord[]>
): Promise<Map<string, Record<string, string>>> {
  const damaged = (name: unknown) =>
    typeof name === 'string' && decodeMailHeader(name).includes('\uFFFD');
  const ids = [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.raw_message_id &&
            (damaged(row.from_name) ||
              (recipientsByMessage.get(row.id) ?? []).some((recipient) =>
                damaged(recipient.display_name)
              ))
        )
        .map((row) => row.raw_message_id as string)
    ),
  ];
  if (!ids.length) return new Map();
  const { data, error } = await privateTable(admin, 'mail_raw_messages')
    .select('id,raw_headers')
    .in('id', ids);
  if (error)
    throw new Error(
      `Failed to recover mail participant names: ${error.message}`
    );
  return new Map(
    (data ?? []).map((row: AnyRecord) => [
      row.id,
      Object.fromEntries(
        Object.entries(row.raw_headers ?? {})
          .filter(
            ([key, value]) =>
              ['from', 'to', 'cc'].includes(key.toLowerCase()) &&
              typeof value === 'string'
          )
          .map(([key, value]) => [key.toLowerCase(), value as string])
      ),
    ])
  );
}
