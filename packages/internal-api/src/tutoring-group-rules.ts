export interface TutoringGroupExclusion {
  scope: 'all' | 'make_up' | 'weak_support';
  match: 'contains' | 'exact' | 'prefix' | 'suffix';
  value: string;
  /**
   * What the rule reads: the class name (default, stored without `target`) or
   * the names of the class group tags, such as a tag recording its format.
   */
  target?: 'name' | 'tag';
}

/**
 * The rule scope a session reason reads. Make-up and weak-support sessions
 * also read rules scoped to them; a custom session reads only `all` rules.
 */
export type TutoringExclusionReason = 'make_up' | 'weak_support';

export function tutoringExclusionReason(
  reasonType: string | null | undefined
): TutoringExclusionReason | null {
  if (reasonType === 'ABSENT_RECOVERY') return 'make_up';
  if (reasonType === 'WEAK_SUPPORT') return 'weak_support';
  return null;
}

/** Strictly parsed exclusion rules; null when any rule is invalid. */
export function parseTutoringGroupExclusions(
  value: unknown[]
): TutoringGroupExclusion[] | null {
  const rules: TutoringGroupExclusion[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const rule = raw as Record<string, unknown>;
    if (
      !['all', 'make_up', 'weak_support'].includes(String(rule.scope)) ||
      !['contains', 'exact', 'prefix', 'suffix'].includes(String(rule.match)) ||
      (rule.target !== undefined &&
        !['name', 'tag'].includes(String(rule.target))) ||
      typeof rule.value !== 'string' ||
      !rule.value.trim() ||
      rule.value.length > 80
    )
      return null;
    rules.push({
      scope: rule.scope as TutoringGroupExclusion['scope'],
      match: rule.match as TutoringGroupExclusion['match'],
      value: rule.value.trim(),
      ...(rule.target === 'tag' ? { target: 'tag' as const } : {}),
    });
  }
  return rules;
}

/** Whether any rule reads class group tags, so callers load tags only then. */
export function hasTutoringTagExclusions(policy: {
  groupExclusions: TutoringGroupExclusion[];
}) {
  return policy.groupExclusions.some((rule) => rule.target === 'tag');
}

/**
 * Folds text for rule matching: decompose (NFD), drop combining marks, map
 * đ/Đ to d (they do not decompose), then lower-case. So `DDT` matches `ĐĐT`
 * and `Mẫu giáo` matches `Mau giao`, in either direction.
 */
function foldForMatch(text: string) {
  return text
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

function matchesRule(rule: TutoringGroupExclusion, text: string) {
  const name = foldForMatch(text);
  const value = foldForMatch(rule.value);
  if (!value) return false;
  if (rule.match === 'exact') return name === value;
  if (rule.match === 'prefix') return name.startsWith(value);
  if (rule.match === 'suffix') return name.endsWith(value);
  return /\s/.test(value) ? name.includes(value) : containsToken(name, value);
}

const LETTER = /\p{L}/u;

/**
 * A single-word `contains` value matches only as its own token: no letter may
 * touch it on either side, while digits, spaces and punctuation are borders.
 * Folding makes `ĐĐT` read as `ddt`, so without this a `DDT` rule would also
 * hide `GDĐT`, the education-department abbreviation. A value edge that is not
 * a letter (such as `-k`) needs no border on that side.
 */
function containsToken(name: string, value: string) {
  const needsStart = LETTER.test(value[0] ?? '');
  const needsEnd = LETTER.test(value.at(-1) ?? '');
  for (
    let index = name.indexOf(value);
    index !== -1;
    index = name.indexOf(value, index + 1)
  ) {
    const before = name[index - 1];
    const after = name[index + value.length];
    if (
      (!needsStart || !before || !LETTER.test(before)) &&
      (!needsEnd || !after || !LETTER.test(after))
    )
      return true;
  }
  return false;
}

/**
 * Match groups using the workspace editable eligibility rules. Tutor groups
 * hold no real students, so they are excluded whatever their name is. Tag
 * rules match any of the class group tag names. A null reason reads only
 * rules scoped to `all`.
 */
export function isTutoringGroupExcluded(
  policy: {
    groupExclusions: TutoringGroupExclusion[];
    tutorGroupIds: string[];
  },
  groupName: string,
  reason: TutoringExclusionReason | null,
  groupId?: string | null,
  groupTags: readonly string[] = []
) {
  if (groupId && policy.tutorGroupIds.includes(groupId.toLowerCase()))
    return true;
  return policy.groupExclusions.some((rule) => {
    if (rule.scope !== 'all' && rule.scope !== reason) return false;
    return rule.target === 'tag'
      ? groupTags.some((tag) => matchesRule(rule, tag))
      : matchesRule(rule, groupName);
  });
}

/**
 * Classes staff may arrange new tutoring for. Every screen that lists classes
 * or learners for arranging or suggesting tutoring reads this, the same rules
 * the support queue reads; booked sessions and history are never filtered.
 */
export function filterTutoringEligibleGroups<
  T extends { id: string; name?: string | null },
>(
  policy: {
    groupExclusions: TutoringGroupExclusion[];
    tutorGroupIds: string[];
  },
  groups: readonly T[],
  reason: TutoringExclusionReason | null,
  tagsByGroupId?: ReadonlyMap<string, readonly string[]>
): T[] {
  return groups.filter(
    (group) =>
      !isTutoringGroupExcluded(
        policy,
        group.name ?? '',
        reason,
        group.id,
        tagsByGroupId?.get(group.id) ?? []
      )
  );
}
