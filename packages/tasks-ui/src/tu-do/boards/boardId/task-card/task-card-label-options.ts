interface TaskCardLabelOption {
  id: string;
  name: string;
  color: string;
}

export function mergeTaskCardLabelOptions<TLabel extends TaskCardLabelOption>(
  workspaceLabels: TLabel[],
  taskLabels: TLabel[]
) {
  const labelsById = new Map<string, TLabel>();

  for (const label of workspaceLabels) {
    labelsById.set(label.id, label);
  }

  for (const label of taskLabels) {
    labelsById.set(label.id, label);
  }

  return Array.from(labelsById.values()).sort((a, b) =>
    (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
  );
}
