import { expect, it } from 'vitest';
import {
  findMeetAssistantMentions,
  hasMeetAssistantMention,
} from './assistant-mentions';

it.each([
  '@Tuturuuu',
  '@ttr',
  'Hello @TTR!',
  '@tuturuuu',
  'Hello, @Tuturuuu',
  'Hello,@Tuturuuu!',
  '(@Tuturuuu)',
  '"@tuturuuu"',
  '**@Tuturuuu**',
])('recognizes standalone handle: %s', (body) => {
  expect(hasMeetAssistantMention(body)).toBe(true);
  const match = findMeetAssistantMentions(body)[0]!;
  expect(['@tuturuuu', '@ttr']).toContain(
    body.slice(match.start, match.end).toLowerCase()
  );
});
it.each([
  'person@Tuturuuu.com',
  'person.name@Tuturuuu.com',
  '@TuturuuuExtra',
  '@Tuturuuu-user',
  '@TuturuuuViệt',
  'https://example.com/@Tuturuuu',
])('does not treat email, URL or longer handle as mention: %s', (body) => {
  expect(hasMeetAssistantMention(body)).toBe(false);
});

it.each([
  '[@ttr](https://example.com)',
  '[@tuturuuu][profile]\n\n[profile]: https://example.com',
  '`@ttr`',
  '```text\n@tuturuuu\n```',
  '![image @ttr](https://example.com/image.png)',
  '<div>\n@ttr\n</div>',
  '@ttrExtra',
  '@ttr-user',
  'person@ttr.com',
])('does not request AI for inert Markdown or another handle: %s', (body) => {
  expect(hasMeetAssistantMention(body)).toBe(false);
});
it.each([
  '**@ttr**',
  '~~@TTR~~',
  '`@ttr` but ask @tuturuuu',
  '| who |\n| --- |\n| @ttr |',
])('recognizes visible Markdown mentions: %s', (body) => {
  expect(hasMeetAssistantMention(body)).toBe(true);
});
