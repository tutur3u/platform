import type { Habit } from '@tuturuuu/types/primitives/Habit';

export const HabitDependencyTypes = ['after', 'before'] as const;
export type HabitDependencyType = (typeof HabitDependencyTypes)[number];

type HabitDependencyRecord = Pick<
  Habit,
  'id' | 'name' | 'dependency_habit_id' | 'dependency_type'
>;

function edgeFromHabit(
  habit: HabitDependencyRecord
): { from: string; to: string } | null {
  const dependencyHabitId = habit.dependency_habit_id;
  const dependencyType = habit.dependency_type;

  if (!dependencyHabitId || !dependencyType) {
    return null;
  }

  if (dependencyType === 'after') {
    return { from: dependencyHabitId, to: habit.id };
  }

  return { from: habit.id, to: dependencyHabitId };
}

export function normalizeHabitDependencyType(
  value: unknown
): HabitDependencyType | null {
  if (value === 'after' || value === 'before') {
    return value;
  }

  return null;
}

export function buildHabitPrerequisiteMap(
  habits: HabitDependencyRecord[]
): Map<string, Set<string>> {
  const habitIds = new Set(habits.map((habit) => habit.id));
  const prerequisites = new Map<string, Set<string>>();

  for (const habit of habits) {
    prerequisites.set(habit.id, new Set<string>());
  }

  for (const habit of habits) {
    const edge = edgeFromHabit(habit);
    if (!edge || !habitIds.has(edge.from) || !habitIds.has(edge.to)) {
      continue;
    }

    const targetPrerequisites = prerequisites.get(edge.to);
    targetPrerequisites?.add(edge.from);
  }

  return prerequisites;
}

export function topologicallySortHabits<T extends HabitDependencyRecord>(
  habits: T[],
  compare: (a: T, b: T) => number
): { sorted: T[]; hasCycle: boolean } {
  const habitIds = new Set(habits.map((habit) => habit.id));
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const byId = new Map(habits.map((habit) => [habit.id, habit]));

  for (const habit of habits) {
    adjacency.set(habit.id, new Set<string>());
    indegree.set(habit.id, 0);
  }

  for (const habit of habits) {
    const edge = edgeFromHabit(habit);
    if (!edge || !habitIds.has(edge.from) || !habitIds.has(edge.to)) {
      continue;
    }

    const children = adjacency.get(edge.from);
    if (children?.has(edge.to)) {
      continue;
    }

    children?.add(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = habits
    .filter((habit) => (indegree.get(habit.id) ?? 0) === 0)
    .sort(compare);
  const sorted: T[] = [];

  while (queue.length > 0) {
    const habit = queue.shift();
    if (!habit) break;

    sorted.push(habit);

    for (const childId of adjacency.get(habit.id) ?? []) {
      const nextIndegree = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, nextIndegree);
      if (nextIndegree === 0) {
        const child = byId.get(childId);
        if (child) {
          queue.push(child);
          queue.sort(compare);
        }
      }
    }
  }

  return {
    sorted:
      sorted.length === habits.length ? sorted : [...habits].sort(compare),
    hasCycle: sorted.length !== habits.length,
  };
}

export function validateHabitDependencyGraph(
  habits: HabitDependencyRecord[],
  candidate: HabitDependencyRecord
): string | null {
  const dependencyHabitId = candidate.dependency_habit_id;
  const dependencyType = candidate.dependency_type;

  if (!dependencyHabitId && !dependencyType) {
    return null;
  }

  if (!dependencyHabitId || !dependencyType) {
    return 'Choose both a dependency mode and a dependency habit';
  }

  if (candidate.id === dependencyHabitId) {
    return 'A habit cannot depend on itself';
  }

  const mergedHabits = [
    ...habits.filter((habit) => habit.id !== candidate.id),
    candidate,
  ];
  const habitIds = new Set(mergedHabits.map((habit) => habit.id));

  if (!habitIds.has(dependencyHabitId)) {
    return 'Selected dependency habit was not found';
  }

  const { hasCycle } = topologicallySortHabits(mergedHabits, (a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '')
  );

  if (hasCycle) {
    return 'Habit dependencies cannot form a circular chain';
  }

  return null;
}
