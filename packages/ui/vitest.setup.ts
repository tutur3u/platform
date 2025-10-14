import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Set up mock Supabase environment variables for tests using vi.stubEnv
// This ensures proper isolation and automatic cleanup between tests
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key');
