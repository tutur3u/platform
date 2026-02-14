import { describe, expect, it } from 'vitest';
import {
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
});
