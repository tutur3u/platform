export function deploymentProfile(
  value = process.env.VITE_INVENTORY_NATIVE_PROFILE ?? 'staging'
) {
  if (value !== 'staging' && value !== 'production') {
    throw new Error('Expected inventory native profile staging or production');
  }
  return {
    name:
      value === 'production'
        ? 'tuturuuu-inventory'
        : 'tuturuuu-inventory-vite-staging',
    vars: { TUTURUUU_NOINDEX: value === 'production' ? '0' : '1' },
  };
}
