export async function cloudPlaygroundRunId(input: {
  meetingId: string;
  ownerId: string;
  projectId: string;
  requester: string;
  requestId: string;
}) {
  const key = JSON.stringify([
    input.meetingId,
    input.ownerId,
    input.projectId,
    input.requester,
    input.requestId,
  ]);
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  );
  // A deterministic request receipt uses the RFC 9562 UUIDv8 version and variant.
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x80;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const id = Array.from(hash.subarray(0, 16), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
  return [
    id.slice(0, 8),
    id.slice(8, 12),
    id.slice(12, 16),
    id.slice(16, 20),
    id.slice(20),
  ].join('-');
}
