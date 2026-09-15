import { encodePathSegment } from './client';
export function workspaceMailPath(workspaceId: string, suffix = '') {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/mail${suffix}`;
}

export function mailboxPath(
  workspaceId: string,
  mailboxId: string,
  suffix = ''
) {
  return workspaceMailPath(
    workspaceId,
    `/mailboxes/${encodePathSegment(mailboxId)}${suffix}`
  );
}

export function jsonHeaders() {
  return {
    'Content-Type': 'application/json',
  };
}
