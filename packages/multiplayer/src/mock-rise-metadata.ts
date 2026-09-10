const departments = [
  'Marketing & Growth',
  'Product & Development',
  'External Relations',
  'People & Culture',
] as const;

export function riseMetadata(
  appName: string,
  appIndex: number,
  primaryTitle: string,
  followupTitle: string
) {
  const department = departments[appIndex % departments.length]!;
  return {
    owner: `${department} owns the RISE ${appName} workspace; its student lead reviews changes.`,
    collaborators: `Assigned ${department} members collaborate here with the other RISE departments.`,
    timeline: `${appName} planning must account for class deadlines, member capacity, and confirmed event dependencies.`,
    status: `“${primaryTitle}” is active; its next decision still needs a named human owner.`,
    access: `${appName} contains practice club data only; personal and assessed student work stays private.`,
    risk: `Details in “${followupTitle}” may be proposals; verify them before outreach, scheduling, or publishing.`,
    metric: `Core ${appName} records plus the shared Induction Day evidence pack · human review required.`,
    next: `Review “${followupTitle}” in ${appName} and propose one practical next step for ${department}.`,
  };
}
