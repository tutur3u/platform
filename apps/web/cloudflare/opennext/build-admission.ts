export function canBuildOpenNextFamily(
  family: { enabled: boolean; id: string },
  env: Record<string, string | undefined> = process.env
) {
  return (
    family.enabled ||
    (family.id === 'api-identity' && env.WEB_OPENNEXT_AUDIT_ONLY === '1')
  );
}
