import { describe, expect, it } from 'vitest';
import {
  getLatestActionName,
  isVisualToolDescriptor,
} from '../collapsible-tool-section';

describe('collapsible tool section helpers', () => {
  it('treats render_ui parts as visual even when the name only exists in type', () => {
    expect(
      isVisualToolDescriptor({
        kind: 'tool',
        key: 'render-ui',
        part: {
          type: 'tool-render_ui',
          toolCallId: 'call-render-ui',
          state: 'output-available',
          input: {},
          output: {},
        } as never,
      })
    ).toBe(true);
  });

  it('shows the latest tool in a collapsed batch when parts do not expose toolName', () => {
    expect(
      getLatestActionName([
        {
          kind: 'tool',
          key: 'tasks',
          part: {
            type: 'tool-get_my_tasks',
            toolCallId: 'call-tasks',
            state: 'output-available',
            input: {},
            output: {},
          } as never,
        },
        {
          kind: 'tool',
          key: 'events',
          part: {
            type: 'tool-get_upcoming_events',
            toolCallId: 'call-events',
            state: 'input-available',
            input: {},
          } as never,
        },
      ])
    ).toBe('Get upcoming events');
  });
});
