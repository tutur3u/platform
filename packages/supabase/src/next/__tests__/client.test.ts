import { createBrowserClient } from '@supabase/ssr';
import { describe, expect, it, vi } from 'vitest';
import { createClient, createDynamicClient } from '../client';

// Mock the environment variables and browser client creation
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(),
}));

vi.mock('../common', () => ({
  checkEnvVariables: () => ({
    url: 'https://test.supabase.co',
    key: 'test-key',
  }),
}));

describe('Supabase Client', () => {
  it('should create a typed client with createClient', () => {
    createClient();
    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key'
    );
  });

  it('should create an untyped client with createDynamicClient', () => {
    createDynamicClient();
    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key'
    );
  });
});
