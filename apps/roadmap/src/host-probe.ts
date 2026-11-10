const COMMIT = /^[a-f0-9]{40}$/;

/** Public probe for one allowlisted product. Roadmap is the apex mount. */
export function publicProbeUrl(id: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(id))
    throw new Error('Invalid public product');
  if (id === 'roadmap') return 'https://tuturuuu.com/roadmap/api/build-info';
  return `https://${id}.tuturuuu.com/api/build-info`;
}

export type ProbeClass = {
  platform: 'workers' | 'vercel' | 'unknown';
  commit: string | null;
};

/**
 * Classify one probe response. The result keeps a Workers commit or nothing.
 * Header values, response bodies and names never leave this function.
 */
export function classifyProbeResponse(
  status: number,
  headers: Headers,
  body: string
): ProbeClass {
  const vercel = headers.get('x-vercel-id');
  if (vercel && vercel.trim()) return { platform: 'vercel', commit: null };
  if (status !== 200) return { platform: 'unknown', commit: null };
  const type = (headers.get('content-type') ?? '').toLowerCase();
  if (!type.includes('application/json'))
    return { platform: 'unknown', commit: null };
  try {
    const parsed = JSON.parse(body) as { commit?: unknown; commitHash?: unknown };
    const commit =
      typeof parsed?.commit === 'string'
        ? parsed.commit
        : typeof parsed?.commitHash === 'string'
          ? parsed.commitHash
          : '';
    if (!COMMIT.test(commit)) return { platform: 'unknown', commit: null };
    return { platform: 'workers', commit };
  } catch {
    return { platform: 'unknown', commit: null };
  }
}
