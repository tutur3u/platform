export async function buildTaskDescriptionUpdate(
  value: string | null | undefined
) {
  if (value === undefined) return {};
  const description = value?.trim() || null;
  const { deriveTaskDescriptionYjsState } =
    await import('@tuturuuu/utils/yjs-task-description');

  return {
    description,
    description_yjs_state: await deriveTaskDescriptionYjsState(description),
  };
}
