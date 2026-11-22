import { expect, it } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import vi from '../../../../../../apps/meet/messages/vi.json';
import { meetTools } from './registry';

const read = (bundle: unknown, key: string) =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      bundle
    );

it.each(meetTools.map((tool) => [tool.id, tool] as const))(
  'names and describes %s in both languages',
  (id, tool) => {
    for (const bundle of [en, vi]) {
      // A label that is not a message key would show raw text in the menu.
      expect(read(bundle, tool.label), tool.label).toBeTypeOf('string');
      expect(
        (bundle.meet.call.activities.descriptions as Record<string, string>)[id]
      ).toBeTypeOf('string');
    }
  }
);

it('tells the pen whiteboard apart from the classroom whiteboard', () => {
  const labels = meetTools.map((tool) => read(en, tool.label));
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels).not.toContain(en.meet.classroom_tools.whiteboard.title);
});
