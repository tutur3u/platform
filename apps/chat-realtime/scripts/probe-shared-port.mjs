// Shared-stack guard for the isolated realtime probe. A leading TOML plus
// is a real port (`smtp_port = +8005`), and comment lines are not.

export function pointsAtSharedDatabase(line) {
  const trimmed = String(line).trim();
  if (trimmed.startsWith('#')) return false;
  return (
    trimmed === 'project_id = "tuturuuu"' ||
    /^[A-Za-z0-9_]*port\s*=\s*\+?800[0-9]\b/.test(trimmed)
  );
}
