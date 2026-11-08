import {
  eqValue,
  type FakeQueryCall,
  type FakeQueryResult,
  inValues,
} from './fake-supabase';

/** Two workspaces, each with one course group, module, and quiz set. */
export const OWN_WS = '00000000-0000-4000-8000-00000000000a';
export const FOREIGN_WS = '00000000-0000-4000-8000-00000000000b';
export const OWN_GROUP = '11111111-1111-4111-8111-11111111111a';
export const FOREIGN_GROUP = '11111111-1111-4111-8111-11111111111b';
export const OWN_MODULE = '22222222-2222-4222-8222-22222222222a';
export const FOREIGN_MODULE = '22222222-2222-4222-8222-22222222222b';
export const OWN_SET = '33333333-3333-4333-8333-33333333333a';
export const FOREIGN_SET = '33333333-3333-4333-8333-33333333333b';

const QUIZ_SETS = [
  { id: OWN_SET, ws_id: OWN_WS, name: 'Own set' },
  { id: FOREIGN_SET, ws_id: FOREIGN_WS, name: 'Foreign set' },
];
const MODULES = [
  { id: OWN_MODULE, group_id: OWN_GROUP },
  { id: FOREIGN_MODULE, group_id: FOREIGN_GROUP },
];
const GROUPS = [
  { id: OWN_GROUP, ws_id: OWN_WS },
  { id: FOREIGN_GROUP, ws_id: FOREIGN_WS },
];

/**
 * Answers the workspace ownership lookups the scope helpers make. Returns
 * `undefined` for any other query so the caller can answer link-table reads.
 */
export function resolveScopeLookup(
  call: FakeQueryCall
): FakeQueryResult | undefined {
  if (call.table === 'workspace_quiz_sets') {
    const id = eqValue(call, 'id');
    const wsId = eqValue(call, 'ws_id');
    return {
      data:
        QUIZ_SETS.find(
          (set) => set.id === id && (wsId === undefined || set.ws_id === wsId)
        ) ?? null,
    };
  }

  if (call.table === 'workspace_course_modules') {
    const ids = inValues(call, 'id');
    if (!ids) return undefined;
    return { data: MODULES.filter((module) => ids.includes(module.id)) };
  }

  if (call.table === 'workspace_user_groups') {
    const ids = inValues(call, 'id') ?? [];
    const wsId = eqValue(call, 'ws_id');
    return {
      data: GROUPS.filter(
        (group) => ids.includes(group.id) && group.ws_id === wsId
      ),
    };
  }

  return undefined;
}
