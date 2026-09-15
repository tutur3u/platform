const ADDRESS =
  /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/giu;

/** Suggest only recipients identified by a delivery failure, never arbitrary addresses in quoted mail. */
export function getFailedMailRecipients(message: {
  subject: string;
  bodyText: string | null;
  safeHeaders?: Record<string, string>;
}) {
  const body = (message.bodyText ?? '').slice(0, 64_000);
  if (
    !/(?:delivery status notification.*fail|undeliver|delivery fail|failure notice|returned mail)/iu.test(
      message.subject
    ) &&
    !/^Action:\s*failed\s*$/imu.test(body)
  )
    return [];
  const candidates: string[] = [];
  const add = (text: string) => candidates.push(...(text.match(ADDRESS) ?? []));
  for (const [key, value] of Object.entries(message.safeHeaders ?? {})) {
    if (key.toLowerCase() === 'x-failed-recipients') add(value);
  }
  const diagnostic =
    body.split(
      /(?:^-{2,}\s*(?:original|forwarded)|^Content-Type:\s*message\/rfc822)/imu
    )[0] ?? '';
  for (const match of diagnostic.matchAll(
    /^Final-Recipient:\s*rfc822;([^\r\n]+)/gimu
  ))
    add(match[1]!);
  for (const match of diagnostic.matchAll(
    /(?:following recipients?|these recipients or groups):[ \t]*([^\r\n]*(?:\r?\n[^\r\n]+){0,8})/giu
  )) {
    const lines = match[1]!.split(/\r?\n/u);
    for (const line of lines) {
      if (
        /^(?:from|to|cc|subject|date|original message|diagnostic-code):/iu.test(
          line.trim()
        )
      )
        break;
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Recipient lines begin with an address; explanatory/support text is not a target.
      const addresses = trimmed.match(ADDRESS) ?? [];
      if (
        !addresses.length ||
        !new RegExp(`^[<\\s]*${ADDRESS.source}`, 'iu').test(trimmed)
      )
        break;
      const rest = trimmed.replace(ADDRESS, '').replace(/[<>,;\s]/gu, '');
      if (rest) add(addresses[0]!);
      else candidates.push(...addresses);
    }
  }
  for (const match of diagnostic.matchAll(
    /(?:wasn't delivered to|could not be delivered to)\s+([^\s<>]+)/giu
  ))
    add(match[1]!);
  return [
    ...new Set(
      candidates.map((address) => address.toLowerCase().replace(/[.]+$/u, ''))
    ),
  ].slice(0, 20);
}
