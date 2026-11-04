/** Allows http(s), mailto, tel, root-relative and hash links; drops `javascript:` and friends. */
export function safeUrl(value: string | undefined) {
  if (!value || value.trimStart() !== value) return undefined;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f) || char === '\\')
      return undefined;
  }
  return /^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(value) ? value : undefined;
}
