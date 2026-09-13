import { expect, it } from 'vitest';
import { collectAssistantMessageParts } from './assistant-message-parts';

it('preserves interleaved content and updates results in call order, not completion order', () => {
  const parts = collectAssistantMessageParts({
    text: 'Final answer',
    steps: [
      {
        content: [
          { type: 'reasoning', text: 'Plan' },
          { type: 'text', text: 'Checking now' },
          {
            type: 'tool-call',
            toolCallId: 'a',
            toolName: 'search_tasks',
            input: {},
          },
          { type: 'text', text: 'Checking another source' },
          {
            type: 'tool-call',
            toolCallId: 'b',
            toolName: 'get_calendar',
            input: {},
          },
        ],
        toolResults: [
          { toolCallId: 'b', output: { count: 2 } },
          { toolCallId: 'a', output: { count: 1 } },
        ],
      },
      { content: [{ type: 'text', text: 'Final answer' }] },
    ],
  });
  expect(parts.map((p) => p.text ?? p.toolCallId ?? p.type)).toEqual([
    'step-start',
    'Plan',
    'Checking now',
    'a',
    'Checking another source',
    'b',
    'step-start',
    'Final answer',
  ]);
  expect(parts[3]).toMatchObject({
    state: 'output-available',
    output: { count: 1 },
  });
});

it('preserves failed and unfinished calls without claiming completion', () => {
  const parts = collectAssistantMessageParts({
    steps: [
      {
        content: [
          {
            type: 'tool-call',
            toolName: 'search_tasks',
            toolCallId: 'a',
            input: {},
          },
          {
            type: 'tool-error',
            toolName: 'search_tasks',
            toolCallId: 'a',
            error: 'Denied',
          },
          {
            type: 'tool-call',
            toolName: 'get_task',
            toolCallId: 'b',
            input: {},
          },
        ],
      },
    ],
  });
  expect(parts[1]).toMatchObject({
    state: 'output-error',
    errorText: 'Denied',
  });
  expect(parts[2]).toMatchObject({ state: 'input-available' });
});

it('supports aggregate-only responses without losing their text or reasoning', () => {
  expect(
    collectAssistantMessageParts({ text: 'Answer', reasoningText: 'Thought' })
  ).toEqual([
    { type: 'text', text: 'Answer' },
    { type: 'reasoning', text: 'Thought' },
  ]);
});

it('preserves SDK StepResult generated files', () => {
  expect(
    collectAssistantMessageParts({
      steps: [
        {
          content: [
            {
              type: 'file',
              file: { mediaType: 'image/png', base64: 'aW1hZ2U=' },
            },
          ],
        },
      ],
    })
  ).toContainEqual({
    type: 'file',
    mediaType: 'image/png',
    url: 'data:image/png;base64,aW1hZ2U=',
  });
});
