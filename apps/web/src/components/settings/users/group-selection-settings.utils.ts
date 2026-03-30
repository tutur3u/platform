import type { ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import type { WorkspaceUserGroup } from '@/hooks/use-workspace-user-groups';

export function normalizeGroupSelection(groupIds: string[]) {
  return [...new Set(groupIds.map((id) => id.trim()).filter(Boolean))];
}

export function hasSameGroupSelection(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  return sortedA.every((value, index) => value === sortedB[index]);
}

export function buildGroupComboboxOptions(
  groups: WorkspaceUserGroup[],
  selectedGroupIds: string[]
): ComboboxOption[] {
  const selectedSet = new Set(selectedGroupIds);

  return groups
    .map((group) => ({
      value: group.id,
      label: group.name + (group.archived ? ' (Archived)' : ''),
    }))
    .sort((a, b) => {
      const aSelected = selectedSet.has(a.value);
      const bSelected = selectedSet.has(b.value);

      if (aSelected === bSelected) {
        return a.label.localeCompare(b.label);
      }

      return aSelected ? -1 : 1;
    });
}

export function hasUnresolvedSelectedGroups(
  selectedGroupIds: string[],
  options: ComboboxOption[]
) {
  const optionValueSet = new Set(options.map((option) => option.value));

  return selectedGroupIds.some((value) => !optionValueSet.has(value));
}
