export interface DomainClaim {
  readonly id: string;
  readonly hostname: string;
  readonly workspaceId: string;
  readonly worldId: string;
}

export interface DomainVerification {
  readonly claimId: string;
  readonly hostname: string;
  readonly workspaceId: string;
  readonly worldId: string;
  readonly dnsVerified: boolean;
  readonly tlsActive: boolean;
  readonly expiresAt: number;
}

export type CustomDomain = DomainClaim &
  (
    | { readonly state: 'pending' | 'suspended' | 'released' }
    | { readonly state: 'verified'; readonly verification: DomainVerification }
  );

interface WorldBinding {
  readonly workspaceId: string;
  readonly worldId: string;
}

export interface PublishedWorld extends WorldBinding {
  readonly releaseId: string;
}

export function normalizeHostname(input: string): string | null {
  if (/[^a-z0-9.-]/i.test(input)) return null;
  const hostname = input.toLowerCase().replace(/\.$/, '');
  const labels = hostname.split('.');
  const suffix = labels.at(-1);
  if (
    hostname.length > 253 ||
    labels.length < 2 ||
    !suffix ||
    !/^[a-z]/.test(suffix) ||
    !labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
    )
  ) {
    return null;
  }
  return hostname;
}

export function defaultHostname(
  label: string,
  namespace: string
): string | null {
  const suffix = normalizeHostname(namespace);
  if (!suffix || label.includes('.')) return null;
  return normalizeHostname(`${label}.${suffix}`);
}

function isReserved(hostname: string, namespace: string): boolean {
  return hostname === namespace || hostname.endsWith(`.${namespace}`);
}

export function claimCustomDomain(
  claim: DomainClaim,
  workspaceId: string,
  namespace: string,
  existing: CustomDomain | null
): CustomDomain | null {
  const hostname = normalizeHostname(claim.hostname);
  const reserved = normalizeHostname(namespace);
  if (
    !hostname ||
    !reserved ||
    isReserved(hostname, reserved) ||
    !claim.id ||
    !claim.worldId ||
    !workspaceId ||
    claim.workspaceId !== workspaceId ||
    (existing &&
      (existing.state !== 'released' ||
        existing.hostname !== hostname ||
        existing.id === claim.id))
  ) {
    return null;
  }
  return { ...claim, hostname, state: 'pending' };
}

function hasCurrentVerification(
  claim: DomainClaim,
  evidence: DomainVerification,
  now: number
): boolean {
  return (
    evidence.claimId === claim.id &&
    evidence.hostname === claim.hostname &&
    evidence.workspaceId === claim.workspaceId &&
    evidence.worldId === claim.worldId &&
    evidence.dnsVerified &&
    evidence.tlsActive &&
    Number.isFinite(now) &&
    Number.isFinite(evidence.expiresAt) &&
    evidence.expiresAt > now
  );
}

export function verifyCustomDomain(
  domain: CustomDomain,
  evidence: DomainVerification,
  now: number
): CustomDomain | null {
  if (
    (domain.state !== 'pending' && domain.state !== 'verified') ||
    !hasCurrentVerification(domain, evidence, now)
  ) {
    return null;
  }
  return { ...domain, state: 'verified', verification: { ...evidence } };
}

export function changeCustomDomainState(
  domain: CustomDomain,
  workspaceId: string,
  action:
    | { type: 'suspend' | 'release' }
    | { type: 'resume'; newClaimId: string }
): CustomDomain | null {
  if (workspaceId !== domain.workspaceId || domain.state === 'released') {
    return null;
  }
  const { id, hostname, worldId } = domain;
  const claim = { id, hostname, workspaceId, worldId };
  switch (action.type) {
    case 'suspend':
      return { ...claim, state: 'suspended' };
    case 'resume':
      return domain.state === 'suspended' &&
        action.newClaimId &&
        action.newClaimId !== id
        ? { ...claim, id: action.newClaimId, state: 'pending' }
        : null;
    case 'release':
      return { ...claim, state: 'released' };
  }
}

export interface HostingSnapshot {
  readonly namespace: string;
  readonly defaults: ReadonlyMap<string, WorldBinding>;
  readonly customDomains: ReadonlyMap<string, CustomDomain>;
  readonly publications: ReadonlyMap<string, PublishedWorld>;
}

export type HostResolution =
  | { readonly status: 'published'; readonly publication: PublishedWorld }
  | { readonly status: 'unknown' | 'disabled' };

export function resolveWorldHost(
  input: string,
  snapshot: HostingSnapshot,
  now: number
): HostResolution {
  const hostname = normalizeHostname(input);
  const namespace = normalizeHostname(snapshot.namespace);
  if (!hostname || !namespace) return { status: 'unknown' };

  let binding: WorldBinding;
  if (isReserved(hostname, namespace)) {
    const label = hostname.slice(0, -(namespace.length + 1));
    const domain = snapshot.defaults.get(hostname);
    if (!domain || defaultHostname(label, namespace) !== hostname) {
      return { status: 'unknown' };
    }
    binding = domain;
  } else {
    const domain = snapshot.customDomains.get(hostname);
    if (!domain) return { status: 'unknown' };
    if (
      domain.hostname !== hostname ||
      domain.state !== 'verified' ||
      !hasCurrentVerification(domain, domain.verification, now)
    ) {
      return { status: 'disabled' };
    }
    binding = domain;
  }

  const publication = snapshot.publications.get(binding.worldId);
  if (
    !publication ||
    publication.workspaceId !== binding.workspaceId ||
    publication.worldId !== binding.worldId ||
    !publication.releaseId
  ) {
    return { status: 'disabled' };
  }
  return { status: 'published', publication };
}
