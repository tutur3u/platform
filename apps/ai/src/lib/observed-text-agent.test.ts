import { describe, expect, it } from 'vitest';
import { resolveGatewayRoutingOptions } from './observed-text-agent';

describe('resolveGatewayRoutingOptions', () => {
  it('prefers the direct Google route before Vertex for Google models', () => {
    expect(
      resolveGatewayRoutingOptions('google/gemini-3.5-flash-lite')
    ).toEqual({
      order: ['google', 'vertex'],
    });
  });

  it('leaves non-Google models on the Gateway default route', () => {
    expect(resolveGatewayRoutingOptions('openai/gpt-5-mini')).toBeUndefined();
  });
});
