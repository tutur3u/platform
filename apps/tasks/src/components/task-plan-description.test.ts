import { expect, it } from 'vitest';
import {
  getTaskPlanDescription,
  MAX_TASK_PLAN_NOTES_LENGTH,
} from './task-plan-description';

const source = 'https://lettin.tuturuuu.com/en/personal/wiki/notebook/overview';
it('omits an empty description and whitespace-only notes', () => {
  expect(getTaskPlanDescription('')).toBeUndefined();
  expect(getTaskPlanDescription(' \r\n ')).toBeUndefined();
});
it('stores authored text as literal paragraphs, preserving internal line breaks', () => {
  expect(
    JSON.parse(getTaskPlanDescription('  Outline <script>\r\n\r\nNext step  ')!)
      .content
  ).toEqual([
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Outline <script>' }],
    },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: 'Next step' }] },
  ]);
});
it('keeps the independently selected reference in its own final paragraph', () => {
  const doc = JSON.parse(getTaskPlanDescription('Authored plan', source)!);
  expect(doc.content[0].content).toEqual([
    { type: 'text', text: 'Authored plan' },
  ]);
  expect(doc.content[1].content[0]).toMatchObject({
    text: source,
    marks: [{ type: 'link', attrs: { href: source } }],
  });
  expect(JSON.parse(getTaskPlanDescription('', source)!)).toEqual({
    type: 'doc',
    content: [doc.content[1]],
  });
});
it('bounds notes before serialization and keeps the largest paragraph shape within the task API limit', () => {
  expect(() =>
    getTaskPlanDescription('x'.repeat(MAX_TASK_PLAN_NOTES_LENGTH + 1))
  ).toThrow(RangeError);
  for (const notes of [
    'x'.repeat(MAX_TASK_PLAN_NOTES_LENGTH),
    'x\n'.repeat(MAX_TASK_PLAN_NOTES_LENGTH / 2),
  ]) {
    expect(getTaskPlanDescription(notes, source)!.length).toBeLessThan(100000);
  }
});
