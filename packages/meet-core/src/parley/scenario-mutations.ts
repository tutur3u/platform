import 'server-only';
import { z } from 'zod';
import { scenarioSchema } from './contracts';
import { parleyDatabase } from './database';

export async function persistParleyScenario(form: FormData, userId: string) {
  const input = scenarioSchema.parse({
    title: form.get('title'),
    category: form.get('category'),
    briefing: form.get('briefing'),
    instructions: form.get('instructions'),
    rubric: form.get('rubric'),
    enabled: form.get('enabled') === 'on',
    roles: JSON.parse(String(form.get('roles') || '[]')),
  });
  const id = form.get('id');
  const db = (await parleyDatabase()).schema('private');
  const { error } = id
    ? await db
        .from('parley_scenarios')
        .update(input)
        .eq('id', z.uuid().parse(id))
    : await db
        .from('parley_scenarios')
        .insert({ ...input, created_by: userId });
  if (error) throw new Error('Could not save scenario');
}
