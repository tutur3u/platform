function cleanSegment(value: string) {
  return encodeURIComponent(value.replace(/^\/+|\/+$/g, ''));
}

export function getRewiseWorkspacePath(workspaceSlug: string, suffix = '') {
  const normalizedSuffix = suffix
    ? `/${suffix.split('/').filter(Boolean).map(cleanSegment).join('/')}`
    : '';

  return `/${cleanSegment(workspaceSlug)}${normalizedSuffix}`;
}

export function getRewiseChatPath(workspaceSlug: string, chatId: string) {
  return getRewiseWorkspacePath(workspaceSlug, `c/${chatId}`);
}
