const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function parseRecipientInput(value: string) {
  const chunks = value.includes('<')
    ? value.split(/[;,\n]+/u)
    : value.split(/[;,\s]+/u);
  return chunks
    .map((chunk) => {
      const trimmed = chunk.trim();
      const named = trimmed.match(/^(?:"([^"]+)"|([^<]+?))?\s*<([^>]+)>$/u);
      const address = (named?.[3] ?? trimmed).trim().toLowerCase();
      const displayName = (named?.[1] ?? named?.[2] ?? '').trim();
      return {
        address,
        displayName: displayName || null,
        valid: EMAIL_PATTERN.test(address),
      };
    })
    .filter((recipient) => recipient.address);
}
