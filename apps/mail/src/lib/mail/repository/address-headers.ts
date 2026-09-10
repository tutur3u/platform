import { decodeMailHeader } from '../address-names';
import { type AnyRecord, privateTable } from './shared';

/** Fetch original headers only for visible messages with missing or damaged names. */
export async function loadDamagedAddressHeaders(
  admin: AnyRecord,
  rows: AnyRecord[],
  recipientsByMessage: Map<string, AnyRecord[]>
): Promise<Map<string, Record<string, string>>> {
  const damaged = (name: unknown) =>
    typeof name !== 'string' ||
    !name.trim() ||
    decodeMailHeader(name).includes('\uFFFD');
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
  const result = new Map<string, Record<string, string>>();
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await privateTable(admin, 'mail_raw_messages')
      .select('id,raw_headers')
      .in('id', ids.slice(start, start + 100));
    if (error)
      throw new Error(
        `Failed to recover mail participant names: ${error.message}`
      );
    for (const row of data ?? []) {
      result.set(
        row.id,
        Object.fromEntries(
          Object.entries(row.raw_headers ?? {})
            .filter(
              ([key, value]) =>
                ['from', 'to', 'cc'].includes(key.toLowerCase()) &&
                typeof value === 'string'
            )
            .map(([key, value]) => [key.toLowerCase(), value as string])
        )
      );
    }
  }
  return result;
}
