import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_DISPLAY_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { z } from 'zod';
import {
  normalizeMarkdownToText,
  type FormDefinitionQuestion,
  validateQuestionValue,
} from './forms-source';
import { getParticipantLaunch, launchReferenceSchema } from './launches';
import type { FormAccess } from './policy';

export const prefillRequestSchema = launchReferenceSchema.extend({
  consent: z.boolean(),
  meetDisplayName: z
    .string()
    .trim()
    .min(1)
    .max(MAX_DISPLAY_NAME_LENGTH)
    .optional(),
  questionIds: z.array(z.guid()).max(120),
});

const titles = {
  displayName: [
    'name',
    'display name',
    'full name',
    'your name',
    'tên',
    'họ tên',
    'họ và tên',
    'tên hiển thị',
  ],
  email: ['email', 'email address', 'your email', 'địa chỉ email'],
  workspace: [
    'workspace',
    'workspace name',
    'không gian làm việc',
    'tên không gian làm việc',
  ],
  role: [
    'role',
    'workspace role',
    'vai trò',
    'vai trò trong không gian làm việc',
  ],
};

type PrefillField = keyof typeof titles;

export function matchPrefillQuestion(
  question: Pick<FormDefinitionQuestion, 'title' | 'type' | 'settings'>
): PrefillField | undefined {
  if (question.type === 'email') return 'email';
  if (question.type !== 'short_text' && question.type !== 'long_text') return;
  const title = normalizeMarkdownToText(question.title)
    .trim()
    .normalize('NFC')
    .toLowerCase()
    .replace(/[?:]+$/u, '')
    .trim();
  if (question.settings.validationMode === 'email') return 'email';
  return (Object.keys(titles) as PrefillField[]).find((field) =>
    titles[field].includes(title)
  );
}

export async function getFormPrefill(
  access: FormAccess,
  launchId: string,
  request: z.output<typeof prefillRequestSchema>
) {
  const db = await createAdminClient({ noCookie: true });
  const { launch, account } = await getParticipantLaunch(
    access,
    db,
    launchId,
    request
  );
  if (
    !request.consent ||
    !request.questionIds.length ||
    launch.form.accessMode === 'anonymous' ||
    !account
  ) {
    return { answers: {} };
  }

  const requested = new Set(request.questionIds);
  const matches = launch.form.sections.flatMap((section) =>
    section.questions.flatMap((question) => {
      if (!requested.has(question.id)) return [];
      const field = matchPrefillQuestion(question);
      return field ? [{ field, question }] : [];
    })
  );
  const fields = new Set(matches.map(({ field }) => field));
  const values: Partial<Record<PrefillField, string>> = {};
  if (access.canReadWorkspace) {
    if (fields.has('displayName')) {
      const name = access.suggestedDisplayName.trim();
      if (name && !name.includes('@')) values.displayName = name.slice(0, 120);
    }
    const wsId = access.meeting.ws_id;
    const [workspace, roles] = await Promise.all([
      fields.has('workspace')
        ? db.from('workspaces').select('name').eq('id', wsId).maybeSingle()
        : null,
      fields.has('role')
        ? db
            .from('workspace_role_members')
            .select('workspace_roles!inner(name)')
            .eq('user_id', access.user.id)
            .eq('workspace_roles.ws_id', wsId)
            .limit(20)
        : null,
    ]);
    if (fields.has('email') && account.email) values.email = account.email;
    if (workspace?.data?.name) values.workspace = workspace.data.name;
    const roleNames = roles?.data?.flatMap(({ workspace_roles: role }) =>
      role?.name ? [role.name] : []
    );
    if (roleNames?.length)
      values.role = [...new Set(roleNames)].sort().join(', ');
  } else if (fields.has('displayName') && request.meetDisplayName) {
    values.displayName = request.meetDisplayName;
  }

  return {
    answers: Object.fromEntries(
      matches.flatMap(({ field, question }) => {
        const value = values[field];
        return value &&
          validateQuestionValue(value, question.settings, question.type).valid
          ? [[question.id, value]]
          : [];
      })
    ),
  };
}
