import { Resolver } from 'node:dns/promises';

/** DNS only: SMTP probes expose arbitrary recipient servers to unsolicited traffic. */
export async function hasDeliverableMx(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(domain))
    return false;
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  const timer = setTimeout(() => resolver.cancel(), 3000);
  try {
    const records = await resolver.resolveMx(domain);
    if (
      records.some(
        (record) => record.exchange === '' || record.exchange === '.'
      )
    )
      return false;
    return records.some((record) =>
      /^[a-z0-9][a-z0-9.-]+[a-z0-9]$/i.test(record.exchange)
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
