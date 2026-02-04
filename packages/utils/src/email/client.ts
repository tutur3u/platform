export function formatEmailAddresses(
  addresses?: string | string[]
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

export const isValidTuturuuuEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@(tuturuuu\.com|xwf\.tuturuuu\.com)$/;
  return emailRegex.test(email);
};

export const isEmail = (text: string): boolean => {
  const emailRegex =
    /^(?:[^<>()[\]\\.,;:\s@"]+(?:\.[^<>()[\]\\.,;:\s@"]+)*|".+")@(?:\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}]|(?:[a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,})$/;
  return emailRegex.test(text);
};

export const isIncompleteEmail = (text: string): boolean => {
  if (!text) return false;

  // Find the @ symbol
  const atIndex = text.indexOf('@');
  if (atIndex === -1) return false;

  // Split into local and domain parts
  const localPart = text.slice(0, atIndex);
  const domainPart = text.slice(atIndex + 1);

  // Return false for cases that are definitely not valid email starts
  if (!localPart || localPart.endsWith(' ') || text.startsWith('@')) {
    return false;
  }

  // Return true if domain part has spaces or is incomplete
  if (domainPart.includes(' ') || !domainPart.includes('.')) {
    return true;
  }

  // Return false if it has a valid domain part
  if (/^[^.\s]+\.[^.\s]+$/.test(domainPart)) {
    return false;
  }

  return true;
};

export const suggestEmails = (text: string): string[] => {
  if (!text) {
    return ['@gmail.com', '@yahoo.com', '@outlook.com', '@tuturuuu.com'];
  }

  const handle = text.split('@')[0];
  const suggestions = [
    `${handle}@gmail.com`,
    `${handle}@yahoo.com`,
    `${handle}@outlook.com`,
    `${handle}@tuturuuu.com`,
  ];

  return suggestions;
};

export function generateEmailSubaddressing(email: string, wsId: string) {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email; // Invalid email, return as is

  const localPart = email.substring(0, atIndex);
  const domainPart = email.substring(atIndex);
  return `${localPart}+ws_${wsId}${domainPart}`;
}
