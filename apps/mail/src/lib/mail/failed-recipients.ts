import { EMAIL_BLACKLIST_REGEX } from '@tuturuuu/utils/email/validation';

const ADDRESS =
  /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/giu;

/** Suggest only recipients identified by a delivery failure, never arbitrary addresses in quoted mail. */
export function getFailedMailRecipients(message: {
  subject: string;
  bodyText: string | null;
  safeHeaders?: Record<string, string>;
}) {
  const body = (message.bodyText ?? '').slice(0, 64_000);
  if (!isMailDeliveryFailure(message.subject, body)) return [];
  const candidates: string[] = [];
  const add = (text: string) =>
    candidates.push(...(text.slice(0, 2048).match(ADDRESS) ?? []));
  for (const [key, value] of Object.entries(message.safeHeaders ?? {})) {
    if (key.toLowerCase() === 'x-failed-recipients') add(value);
  }
  const diagnostic =
    body.split(
      /(?:^-{2,}\s*(?:original|forwarded)|^Content-Type:\s*message\/rfc822)/imu
    )[0] ?? '';
  for (const block of diagnostic.split(/(?=^Final-Recipient:)/gimu)) {
    const recipient = block.match(
      /^Final-Recipient:\s*rfc822;([^\r\n]+)/imu
    )?.[1];
    if (!recipient) continue;
    const action = block.match(/^Action:\s*(\S+)/imu)?.[1]?.toLowerCase();
    if (action !== 'failed' && (action || !/^Status:\s*5\./imu.test(block)))
      continue;
    add(recipient);
  }
  for (const match of diagnostic.matchAll(
    /(?:(?:following|these) recipients?(?: or groups)?(?: were affected)?):[ \t]*([^\r\n]*(?:\r?\n[^\r\n]+){0,8})/giu
  )) {
    const lines = match[1]!.split(/\r?\n/u);
    for (const line of lines) {
      if (
        /^(?:from|to|cc|subject|date|original message|diagnostic-code):/iu.test(
          line.trim()
        )
      )
        break;
      const trimmed = line.trim().slice(0, 2048);
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
      candidates
        .map((address) => address.toLowerCase().replace(/[.]+$/u, ''))
        .filter((address) => EMAIL_BLACKLIST_REGEX.test(address))
    ),
  ].slice(0, 20);
}

/** A cheap eligibility hint; the API derives recipients from the full authorized message. */
export function isMailDeliveryFailure(subject: string, body = '') {
  return (
    /(?:delivery status notification.*fail|delivery has failed|undeliver|delivery fail|failure notice|returned mail)/iu.test(
      subject
    ) || /^Action:\s*failed\s*$/imu.test(body)
  );
}
