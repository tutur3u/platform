import { vi } from 'vitest';

vi.mock('@tuturuuu/utils/required-mfa-supabase-session', () => ({
  resolveVerifiedSupabaseMfa: async () => ({ status: 'allowed', proof: null }),
}));
vi.mock('@tuturuuu/utils/required-mfa-app-session', () => ({
  resolveRequiredMfaAppSessionAuthority: async () => ({
    status: 'allowed',
    required: false,
  }),
  isRequiredMfaAppSessionAllowed: async () => true,
}));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));
