export function formatEmailAddresses(
  addresses: string | string[]
): { name: string; email: string; raw: string }[] {
  if (!addresses) return [];
  const arr = Array.isArray(addresses) ? addresses : [addresses];
  return arr
    .filter((addr): addr is string => typeof addr === 'string')
    .map((addr) => {
      const match = addr.match(
        /^(.+?)\s*<\s*([\w\-.+]+@[\w\-.]+\.[a-zA-Z]{2,})\s*>$/
      );
      if (match) {
        return { name: match[1] ?? '', email: match[2] ?? '', raw: addr };
      }
      // If just an email
      if (/^[\w\-.+]+@[\w\-.]+\.[a-zA-Z]{2,}$/.test(addr)) {
        return { name: '', email: addr, raw: addr };
      }
      return { name: '', email: '', raw: addr };
    });
}
