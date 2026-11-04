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

function matchesRule(rule: TutoringGroupExclusion, text: string) {
  const name = text.trim().toLocaleLowerCase();
  const value = rule.value.trim().toLocaleLowerCase();
  if (!value) return false;
  if (rule.match === 'exact') return name === value;
  if (rule.match === 'prefix') return name.startsWith(value);
  if (rule.match === 'suffix') return name.endsWith(value);
  return name.includes(value);
}

/**
 * Match groups using the workspace editable eligibility rules. Tutor groups
 * hold no real students, so they are excluded whatever their name is. Tag
 * rules match any of the class group tag names.
 */
export function isTutoringGroupExcluded(
  policy: {
    groupExclusions: TutoringGroupExclusion[];
    tutorGroupIds: string[];
  },
  groupName: string,
  reason: 'make_up' | 'weak_support',
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
