import { fromMarkdown } from 'mdast-util-from-markdown';
import { describe, expect, it } from 'vitest';
import {
  isMeetAssistant,
  MEET_ASSISTANT_ID,
  MEET_ASSISTANT_PROFILE,
  MEET_MENTION_MARKER,
  remarkMeetMentions,
} from './assistant-identity';

describe('Meet assistant identity', () => {
  it('requires both the reserved sender and the server assistant marker', () => {
    expect(isMeetAssistant({ userId: 'ordinary-user', assistant: true })).toBe(
      false
    );
    expect(isMeetAssistant({ userId: MEET_ASSISTANT_ID })).toBe(false);
    expect(
      isMeetAssistant({ userId: MEET_ASSISTANT_ID, assistant: true })
    ).toBe(true);
  });
  it('highlights standalone mentions while preserving adjacent text', () => {
    const tree = {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Hi @tuturuuu, ask @TTR now. email@Tuturuuu @TuturuuuExtra',
        },
      ],
    };
    remarkMeetMentions()(tree);
    expect(tree.children).toEqual([
      { type: 'text', value: 'Hi ' },
      {
        type: 'link',
        url: MEET_ASSISTANT_PROFILE,
        title: MEET_MENTION_MARKER,
        children: [{ type: 'text', value: '@tuturuuu' }],
      },
      { type: 'text', value: ', ask ' },
      {
        type: 'link',
        url: MEET_ASSISTANT_PROFILE,
        title: MEET_MENTION_MARKER,
        children: [{ type: 'text', value: '@TTR' }],
      },
      { type: 'text', value: ' now. email@Tuturuuu @TuturuuuExtra' },
    ]);
  });
  it('does not reinterpret code, raw HTML or existing links as profile mentions', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'inlineCode', value: '@Tuturuuu' },
        { type: 'code', value: '@Tuturuuu' },
        { type: 'html', value: '<b>@Tuturuuu</b>' },
        {
          type: 'link',
          url: MEET_ASSISTANT_PROFILE,
          title: 'Ordinary profile link',
          children: [{ type: 'text', value: '@Tuturuuu' }],
        },
      ],
    };
    const before = structuredClone(tree);
    remarkMeetMentions()(tree);
    expect(tree).toEqual(before);
  });
});

it.each([
  '`code`@ttr',
  '[person](https://example.com)@tuturuuu',
  '<span>@ttr</span>',
  '<span> **@ttr** </span>',
  '**<span> @ttr </span>**',
  '*<span> @tuturuuu </span>*',
  '## **<span> @ttr </span>**',
])('keeps adjacent Markdown text inert: %s', (source) => {
  const tree = fromMarkdown(source);
  const before = structuredClone(tree);
  remarkMeetMentions()(tree, { value: source });
  expect(tree).toEqual(before);
});

it('preserves raw HTML while highlighting a separate normal paragraph', () => {
  const source = '<div>HTML</div>\n\n@ttr help';
  const tree = fromMarkdown(source);
  const html = structuredClone(tree.children[0]);
  remarkMeetMentions()(tree, { value: source });
  expect(tree.children[0]).toEqual(html);
  expect(tree.children[1]).toMatchObject({
    type: 'paragraph',
    children: [
      {
        type: 'link',
        title: MEET_MENTION_MARKER,
        children: [{ type: 'text', value: '@ttr' }],
      },
      { type: 'text', value: ' help' },
    ],
  });
});
