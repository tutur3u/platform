import {
  type CiteWork,
  ambiguousCitationIdentityKeys,
  canonicalWorkKey,
  citationIdentityGroupIsCompatible,
  hardMatchKeys,
} from '@tuturuuu/cite';

/** Uses unambiguous identities and checks every member before joining groups. */
export function groupCitationWorks(works: readonly CiteWork[]): number[] {
  const roots = works.map((_, index) => index);
  const ambiguous = ambiguousCitationIdentityKeys(works);
  const owners = new Map<string, number[]>();
  const rootOf = (index: number): number => {
    let root = index;
    while (roots[root] !== root) root = roots[root] ?? root;
    return root;
  };
  for (const [index, work] of works.entries()) {
    const hard = hardMatchKeys(work);
    const keys = hard.length ? hard : [`fields:${canonicalWorkKey(work)}`];
    for (const key of keys) {
      if (ambiguous.has(key)) continue;
      const existing = owners.get(key);
      if (existing) existing.push(index);
      else owners.set(key, [index]);
    }
  }
  const priority = (key: string) =>
    ['doi:', 'arxiv:', 'pmid:', 'isbn:', 'url:', 'fields:'].findIndex(
      (prefix) => key.startsWith(prefix)
    );
  const ordered = [...owners].sort(
    ([a], [b]) => priority(a) - priority(b) || a.localeCompare(b)
  );
  for (const [, indices] of ordered) {
    if (indices.length < 2) continue;
    const joining = new Set(indices.map(rootOf));
    if (joining.size < 2) continue;
    const members = works.filter((_, index) => joining.has(rootOf(index)));
    if (!citationIdentityGroupIsCompatible(members)) continue;
    const root = Math.min(...joining);
    for (const index of joining) roots[index] = root;
  }
  return works.map((_, index) => rootOf(index));
}
