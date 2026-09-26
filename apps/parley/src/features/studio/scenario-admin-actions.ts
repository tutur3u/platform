'use server';

import { requireParleyStudioAdministrator } from '@tuturuuu/meet-core/parley/authorization';
import { persistParleyScenario } from '@tuturuuu/meet-core/parley/scenario-mutations';
import { revalidatePath } from 'next/cache';

export async function saveStudioScenario(form: FormData) {
  const user = await requireParleyStudioAdministrator();
  await persistParleyScenario(form, user.id);
  revalidatePath('/manage/scenarios');
  revalidatePath('/');
  revalidatePath('/sessions/new');
}
