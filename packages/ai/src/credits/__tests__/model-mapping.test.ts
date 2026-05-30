import { describe, expect, it } from 'vitest';
import {
  isGoogleModelId,
  normalizeStableModelId,
  resolveGatewayModelId,
  toBareModelName,
  toGatewayModelId,
} from '../model-mapping';

describe('model-mapping', () => {
  describe('toGatewayModelId', () => {
    it('combines provider and model name', () => {
      expect(toGatewayModelId('google', 'gemini-2.5-flash')).toBe(
        'google/gemini-2.5-flash'
      );
    });

    it('works with anthropic provider', () => {
      expect(toGatewayModelId('anthropic', 'claude-3-opus')).toBe(
        'anthropic/claude-3-opus'
      );
    });
  });

  describe('resolveGatewayModelId', () => {
    it('prepends google/ by default for bare model names', () => {
      expect(resolveGatewayModelId('gemini-2.5-flash')).toBe(
        'google/gemini-2.5-flash'
      );
    });

    it('passes through model names already in gateway format', () => {
      expect(resolveGatewayModelId('google/gemini-2.5-flash')).toBe(
        'google/gemini-2.5-flash'
      );
    });

    it('uses custom provider when specified', () => {
      expect(resolveGatewayModelId('claude-3-opus', 'anthropic')).toBe(
        'anthropic/claude-3-opus'
      );
    });

    it('passes through anthropic/ prefixed model', () => {
      expect(resolveGatewayModelId('anthropic/claude-3-opus')).toBe(
        'anthropic/claude-3-opus'
      );
    });
  });

  describe('toBareModelName', () => {
    it('extracts model name from gateway ID', () => {
      expect(toBareModelName('google/gemini-2.5-flash')).toBe(
        'gemini-2.5-flash'
      );
    });

    it('returns bare name unchanged', () => {
      expect(toBareModelName('gemini-2.5-flash')).toBe('gemini-2.5-flash');
    });

    it('handles models with multiple slashes', () => {
      expect(toBareModelName('provider/model/variant')).toBe('model/variant');
    });
  });

  describe('isGoogleModelId', () => {
    it('treats bare names and Google-prefixed ids as Google models', () => {
      expect(isGoogleModelId('gemini-2.5-flash')).toBe(true);
      expect(isGoogleModelId('google/gemini-2.5-flash')).toBe(true);
      expect(isGoogleModelId('google/imagen-4.0-generate-001')).toBe(true);
      expect(isGoogleModelId('google-vertex/gemini-2.5-flash')).toBe(true);
    });

    it('does not classify other provider prefixes as Google models', () => {
      expect(isGoogleModelId('openai/gpt-5')).toBe(false);
      expect(isGoogleModelId('anthropic/claude-sonnet-4')).toBe(false);
    });
  });

  describe('normalizeStableModelId', () => {
    it('maps Gemini 3.1 Flash Lite preview ids to the stable model id', () => {
      expect(normalizeStableModelId('gemini-3.1-flash-lite-preview')).toBe(
        'gemini-3.1-flash-lite'
      );
      expect(
        normalizeStableModelId('google/gemini-3.1-flash-lite-preview')
      ).toBe('google/gemini-3.1-flash-lite');
    });

    it('maps the invalid Gemini 3 Flash alias to Gemini 3.1 Flash Lite', () => {
      expect(normalizeStableModelId('gemini-3-flash')).toBe(
        'gemini-3.1-flash-lite'
      );
      expect(normalizeStableModelId('google/gemini-3-flash')).toBe(
        'google/gemini-3.1-flash-lite'
      );
    });

    it('preserves provider prefixes and unrelated preview models', () => {
      expect(
        normalizeStableModelId('google-vertex/gemini-3.1-flash-lite-preview')
      ).toBe('google-vertex/gemini-3.1-flash-lite');
      expect(normalizeStableModelId('google-vertex/gemini-3-flash')).toBe(
        'google-vertex/gemini-3.1-flash-lite'
      );
      expect(normalizeStableModelId('gemini-3.1-flash-live-preview')).toBe(
        'gemini-3.1-flash-live-preview'
      );
    });
  });
});
