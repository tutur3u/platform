import { vi } from 'vitest';

vi.mock('@tuturuuu/utils/required-mfa-supabase-session', () => ({
  resolveVerifiedSupabaseMfa: async () => ({ status: 'allowed', proof: null }),
}));
vi.mock('@tuturuuu/utils/required-mfa-app-session', () => ({
  isRequiredMfaAppSessionAllowed: async () => true,
}));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));
