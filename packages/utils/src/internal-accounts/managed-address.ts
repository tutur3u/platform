const MANAGED_ROOT = 'tuturuuu.com';
const LOCAL_ATOM = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/** Directory classification only; this never grants employee or administrator access. */
export function parseManagedAccountAddress(value: string | null | undefined) {
  if (!value || value.length > 254 || value.trim() !== value) return null;
  const parts = value.split('@');
  if (parts.length !== 2) return null;
  const [local, rawDomain] = parts;
  if (!local || !rawDomain || local.length > 64 || rawDomain.length > 253) {
    return null;
  }
  if (!local.split('.').every((atom) => LOCAL_ATOM.test(atom))) return null;
  if (!rawDomain.split('.').every((label) => DOMAIN_LABEL.test(label)))
    return null;
  const domain = rawDomain.toLowerCase();
  if (domain !== MANAGED_ROOT && !domain.endsWith(`.${MANAGED_ROOT}`))
    return null;
  return {
    address: `${local.toLowerCase()}@${domain}`,
    domain,
    isRoot: domain === MANAGED_ROOT,
  };
}
