export const taskCommentsKey = (wsId: string, taskId?: string) =>
  ['task-comments', wsId, taskId] as const;

export const taskLinksKey = (wsId: string, taskId?: string) =>
  ['task-links', wsId, taskId] as const;

export const taskExternalRefKey = (wsId: string, taskId?: string) =>
  ['task-external-ref', wsId, taskId] as const;

/** The activity timeline shares the history key so existing invalidations apply. */
export const taskTimelineKey = (wsId: string, taskId?: string) =>
  ['task-history', wsId, taskId] as const;
