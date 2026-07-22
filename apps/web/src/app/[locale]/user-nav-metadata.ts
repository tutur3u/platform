import { isEmail, isIncompleteEmail } from '@tuturuuu/utils/email/client';

export function resolveUserNavSecondaryLabel({
  email,
  workspaceName,
  workspacePersonal,
  workspaceSelectorVisible,
}: {
  email?: string | null;
  workspaceName?: string | null;
  workspacePersonal?: boolean;
  workspaceSelectorVisible: boolean;
}) {
  const normalizedEmail = email?.trim() ?? '';
  const normalizedWorkspaceName = workspaceName?.trim() ?? '';
  const workspaceNameLooksLikeEmail =
    isEmail(normalizedWorkspaceName) ||
    isIncompleteEmail(normalizedWorkspaceName);

  if (
    !workspaceSelectorVisible &&
    !workspacePersonal &&
    normalizedWorkspaceName &&
    !workspaceNameLooksLikeEmail
  ) {
    return normalizedWorkspaceName;
  }

  return normalizedEmail;
}
