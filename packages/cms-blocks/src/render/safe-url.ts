/** Allows http(s), mailto, tel, root-relative and hash links; drops `javascript:` and friends. */
export function safeUrl(value: string | undefined) {
  if (!value) return undefined;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f) || char === '\\')
      return undefined;
  }
  const trimmed = value.trim();
  return /^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(trimmed)
    ? trimmed
    : undefined;
}
