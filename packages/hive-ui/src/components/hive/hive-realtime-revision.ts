export function shouldApplyHiveRealtimeRevision(
  incomingRevision: number,
  currentRevision: number
) {
  if (!Number.isFinite(incomingRevision) || incomingRevision < 0) {
    return false;
  }

  if (!Number.isFinite(currentRevision) || currentRevision < 0) {
    return true;
  }

  return (
    incomingRevision > currentRevision ||
    (incomingRevision === 0 && currentRevision === 0)
  );
}
