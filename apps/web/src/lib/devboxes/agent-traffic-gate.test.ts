import { describe, expect, it } from 'vitest';
import {
  DEVBOX_AGENT_API_ENABLED_ENV,
  isDevboxAgentApiEnabled,
} from './agent-traffic-gate';

describe('devbox agent traffic gate', () => {
  it('blocks agent poll and heartbeat by default', () => {
    expect(isDevboxAgentApiEnabled({})).toBe(false);
    expect(
      isDevboxAgentApiEnabled({ [DEVBOX_AGENT_API_ENABLED_ENV]: '' })
    ).toBe(false);
    expect(
      isDevboxAgentApiEnabled({ [DEVBOX_AGENT_API_ENABLED_ENV]: 'false' })
    ).toBe(false);
  });

  it.each([
    '1',
    'true',
    'TRUE',
    'yes',
    'on',
  ])('allows agent poll and heartbeat when %s is configured', (value) => {
    expect(
      isDevboxAgentApiEnabled({ [DEVBOX_AGENT_API_ENABLED_ENV]: value })
    ).toBe(true);
  });
});
