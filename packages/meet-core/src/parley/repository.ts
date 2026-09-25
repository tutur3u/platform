import 'server-only';
import {
  buildScenarioInstructions,
  type ScenarioSummary,
  scenarioSchema,
  scenarioSummarySchema,
} from './contracts';
import { parleyDatabase } from './database';

function publicScenario(row: unknown): ScenarioSummary {
  const scenario = scenarioSummarySchema.parse(row);
  return {
    ...scenario,
    roles: scenario.roles.map(({ name, controller }) => ({
      name,
      controller,
      brief: '',
    })),
  };
}
export async function listScenarios(): Promise<ScenarioSummary[]> {
  const db = await parleyDatabase();
  const scenarios: ScenarioSummary[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .schema('private')
      .from('parley_scenarios')
      .select('id, title, category, briefing, roles, revision')
      .eq('enabled', true)
      .order('title')
      .order('id')
      .range(offset, offset + 999);
    if (error) throw new Error('Scenario catalog unavailable');
    scenarios.push(...data.map(publicScenario));
    if (data.length < 1000) return scenarios;
  }
}
export async function getPublishedScenario(id: string) {
  const { data, error } = await (await parleyDatabase())
    .schema('private')
    .from('parley_scenarios')
    .select('id, title, category, briefing, roles, revision')
    .eq('enabled', true)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Scenario unavailable');
  return data ? publicScenario(data) : null;
}
export async function getSessionScenario(meetingId: string) {
  const { data, error } = await (await parleyDatabase())
    .schema('private')
    .from('parley_sessions')
    .select('snapshot, created_at, scenario_revision')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (error) throw new Error('Scenario session unavailable');
  return data
    ? {
        ...scenarioSchema.parse(data.snapshot),
        createdAt: data.created_at,
        revision: data.scenario_revision,
      }
    : null;
}
export async function getScenarioPrompt(meetingId: string) {
  const scenario = await getSessionScenario(meetingId);
  return scenario ? buildScenarioInstructions(scenario) : '';
}

export async function isParleySession(meetingId: string, required = false) {
  const { data, error } = await (await parleyDatabase())
    .schema('private')
    .from('parley_sessions')
    .select('meeting_id')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  // Meet can be deployed before the additive Parley schema; Parley cannot.
  if (error && !required && ['42P01', 'PGRST205'].includes(error.code))
    return false;
  if (error) throw new Error('Scenario access unavailable');
  return Boolean(data);
}

/** Facilitator archive. Never return another account's private session snapshot. */
export async function listFacilitatedSessions(userId: string, page = 0) {
  const db = await parleyDatabase();
  const { data, error } = await db
    .schema('private')
    .from('parley_sessions')
    .select('meeting_id, scenario_id, scenario_revision, snapshot, created_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .order('meeting_id')
    .range(page * 20, page * 20 + 20);
  if (error) throw new Error('Session archive unavailable');
  return {
    hasMore: data.length > 20,
    sessions: data.slice(0, 20).map((row) => {
      const snapshot = scenarioSchema.parse(row.snapshot);
      return {
        id: row.meeting_id,
        scenarioId: row.scenario_id,
        revision: row.scenario_revision,
        createdAt: row.created_at,
        title: snapshot.title,
        category: snapshot.category,
        briefing: snapshot.briefing,
        roleCount: snapshot.roles.length,
      };
    }),
  };
}

export async function getFacilitatorNotes(
  meetingId: string,
  userId: string,
  page = 0
) {
  const db = await parleyDatabase();
  const { data: session, error: sessionError } = await db
    .schema('private')
    .from('parley_sessions')
    .select('meeting_id')
    .eq('meeting_id', meetingId)
    .eq('created_by', userId)
    .maybeSingle();
  if (sessionError) throw new Error('Session authorization unavailable');
  if (!session) return null;
  const { data, error, count } = await db
    .schema('private')
    .from('parley_observations')
    .select('id, kind, content, created_at', { count: 'exact' })
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false })
    .order('id')
    .range(page * 20, page * 20 + 19);
  if (error) throw new Error('Observations unavailable');
  const { count: decisions, error: decisionsError } = await db
    .schema('private')
    .from('parley_observations')
    .select('id', { count: 'exact', head: true })
    .eq('meeting_id', meetingId)
    .eq('kind', 'decision');
  if (decisionsError) throw new Error('Observations unavailable');
  return {
    notes: data,
    total: count ?? 0,
    decisions: decisions ?? 0,
    hasMore: (page + 1) * 20 < (count ?? 0),
  };
}
