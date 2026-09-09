import { expect, it } from 'vitest';
import {
  findMeetAssistantMentions,
  hasMeetAssistantMention,
} from './assistant-mentions';

it.each([
  '@Tuturuuu',
  'Hello, @Tuturuuu',
  'Hello,@Tuturuuu!',
  '(@Tuturuuu)',
  '"@tuturuuu"',
  '**@Tuturuuu**',
])('recognizes standalone handle: %s', (body) => {
  expect(hasMeetAssistantMention(body)).toBe(true);
  const match = findMeetAssistantMentions(body)[0]!;
  expect(body.slice(match.start, match.end).toLowerCase()).toBe('@tuturuuu');
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
