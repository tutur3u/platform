import { describe, expect, it } from 'vitest';
import { supportedProviders } from './supported-providers';

describe('supportedProviders', () => {
  it('should be a readonly array', () => {
    expect(Array.isArray(supportedProviders)).toBe(true);
  });

  it('should contain "google" provider', () => {
    expect(supportedProviders).toContain('google');
  });

  it('should contain "google-vertex" provider', () => {
    expect(supportedProviders).toContain('google-vertex');
  });

  it('should contain "openai" provider', () => {
    expect(supportedProviders).toContain('openai');
  });

  it('should contain "anthropic" provider', () => {
    expect(supportedProviders).toContain('anthropic');
  });

  it('should have exactly 4 supported providers', () => {
    expect(supportedProviders).toHaveLength(4);
  });

  it('should have all unique values', () => {
    const uniqueProviders = new Set(supportedProviders);
    expect(uniqueProviders.size).toBe(supportedProviders.length);
  });

  it('should only contain string values', () => {
    supportedProviders.forEach((provider) => {
      expect(typeof provider).toBe('string');
    });
  });

  it('should include major AI providers', () => {
    const majorProviders = ['google', 'openai', 'anthropic'];
    majorProviders.forEach((provider) => {
      expect(supportedProviders).toContain(provider);
    });
  });
});
