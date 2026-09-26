'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireParleyAdministrator } from './authorization';
import { parleyDatabase } from './database';
import { persistParleyScenario } from './scenario-mutations';

const adminPath = '/internal/parley';
export async function saveParleyMember(form: FormData) {
  const user = await requireParleyAdministrator();
  const email = z
    .email()
    .max(254)
    .parse(
      String(form.get('email') ?? '')
        .trim()
        .toLowerCase()
    );
  const enabled = form.get('enabled') === 'true';
  const { error } = await (await parleyDatabase())
    .schema('private')
    .from('parley_members')
    .upsert({ email, enabled, created_by: user.id }, { onConflict: 'email' });
  if (error) throw new Error('Could not save access');
  revalidatePath(adminPath);
}
export async function saveParleyScenario(form: FormData) {
  const user = await requireParleyAdministrator();
  await persistParleyScenario(form, user.id);
  revalidatePath(adminPath);
}
export async function uploadParleyReference(form: FormData) {
  const user = await requireParleyAdministrator();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > 900_000)
    throw new Error('Invalid file');
  const allowed = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/pdf',
  ];
  if (!allowed.includes(file.type)) throw new Error('Unsupported file');
  const bytes = Buffer.from(await file.arrayBuffer());
  const scenarioId = form.get('scenario_id');
  const { error } = await (await parleyDatabase())
    .schema('private')
    .from('parley_references')
    .insert({
      filename: file.name.slice(0, 255),
      media_type: file.type,
      content_base64: bytes.toString('base64'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      scenario_id: scenarioId ? z.uuid().parse(scenarioId) : null,
      created_by: user.id,
    });
  if (error)
    throw new Error('Could not store reference (duplicates are not added)');
  revalidatePath(adminPath);
}
