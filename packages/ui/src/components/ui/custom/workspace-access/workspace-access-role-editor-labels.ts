import type { WorkspaceAccessRoleEditorState } from './types';

export function getWorkspaceAccessRoleEditorLabels(
  state: WorkspaceAccessRoleEditorState,
  t: (key: string) => string
) {
  if (state.mode === 'create') {
    return {
      description: t('ws-roles.create_description'),
      save: t('ws-roles.create'),
      title: t('ws-roles.create'),
    };
  }

  if (state.mode === 'default') {
    const isGuest = state.memberType === 'GUEST';
    return {
      description: isGuest
        ? t('ws-roles.guest_defaults_description')
        : t('ws-roles.member_defaults_description'),
      save: t('common.save'),
      title: isGuest
        ? t('ws-roles.guest_defaults')
        : t('ws-roles.member_defaults'),
    };
  }

  return {
    description: t('ws-roles.edit_description'),
    save: t('common.save'),
    title: t('ws-roles.edit'),
  };
}
