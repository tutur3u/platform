import 'server-only';
import {
  buildScenarioInstructions,
  type ScenarioSummary,
  scenarioSchema,
  scenarioSummarySchema,
} from './contracts';
import { parleyDatabase } from './database';

export async function listScenarios(): Promise<ScenarioSummary[]> {
  const { data, error } = await (await parleyDatabase())
    .schema('private')
    .from('parley_scenarios')
    .select('id, title, category, briefing, roles, revision')
    .eq('enabled', true)
    .order('title')
    .limit(100);
  if (error) throw new Error('Scenario catalog unavailable');
  return (data ?? []).map((row) => scenarioSummarySchema.parse(row));
}
export async function getSessionScenario(meetingId: string) {
  const { data, error } = await (await parleyDatabase())
    .schema('private')
    .from('parley_sessions')
    .select('snapshot')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (error) throw new Error('Scenario session unavailable');
  return data ? scenarioSchema.parse(data.snapshot) : null;
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
