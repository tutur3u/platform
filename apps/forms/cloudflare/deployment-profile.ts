export function deploymentProfile(
  value = process.env.VITE_FORMS_NATIVE_PROFILE ?? 'staging'
) {
  if (value !== 'staging' && value !== 'production') {
    throw new Error('Expected forms native profile staging or production');
  }
  return {
    name:
      value === 'production' ? 'tuturuuu-forms' : 'tuturuuu-forms-vite-staging',
    vars: { TUTURUUU_NOINDEX: value === 'production' ? '0' : '1' },
  };
}
