'use server';

import { requireParleyStudioAdministrator } from '@tuturuuu/meet-core/parley/authorization';
import { persistParleyScenario } from '@tuturuuu/meet-core/parley/scenario-mutations';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ScenarioSaveState } from './scenario-save-state';

export async function saveStudioScenario(
  _previous: ScenarioSaveState,
  form: FormData
): Promise<ScenarioSaveState> {
  const user = await requireParleyStudioAdministrator();
  try {
    await persistParleyScenario(form, user.id);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: ScenarioSaveState['errors'] = {};
      for (const issue of error.issues) {
        const field = issue.path[0];
        if (
          typeof field === 'string' &&
          field in
            {
              title: true,
              category: true,
              briefing: true,
              instructions: true,
              roles: true,
              rubric: true,
              enabled: true,
            }
        ) {
          errors[field as keyof typeof errors] = true;
        }
      }
      return { status: 'invalid', errors };
    }
    console.error('Parley scenario save failed');
    return { status: 'failed', errors: {} };
  }
  revalidatePath('/manage/scenarios');
  revalidatePath('/');
  revalidatePath('/sessions/new');
  return { status: 'saved', errors: {} };
}
