/** Own-property lookup: pasted citation ids such as "toString" must not resolve to Object.prototype members. */
export function citationInText(
  inText: Readonly<Record<string, string>> | undefined,
  citationId: string | null | undefined
): string | undefined {
  return inText && citationId && Object.hasOwn(inText, citationId)
    ? inText[citationId]
    : undefined;
}
