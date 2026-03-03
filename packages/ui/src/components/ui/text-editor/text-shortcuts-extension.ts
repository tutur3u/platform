import { InputRule } from '@tiptap/core';
import { Extension } from '@tiptap/react';
import { TEXT_REPLACEMENT_RULES } from './text-replacements';

const escapeForRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ambiguousTriggers = new Set(['<-', '<--', '--']);

const boundaryRules = [
  {
    find: /<- $/,
    replacement: '← ',
  },
  {
    find: /<-- $/,
    replacement: '⟵ ',
  },
  {
    find: /-- $/,
    replacement: '– ',
  },
];

export const TextShortcuts = Extension.create({
  name: 'textShortcuts',

  addInputRules() {
    const directRules = TEXT_REPLACEMENT_RULES.filter(
      (rule) => !ambiguousTriggers.has(rule.trigger)
    ).map(
      (rule) =>
        new InputRule({
          find: new RegExp(`${escapeForRegex(rule.trigger)}$`),
          handler: ({ chain, range }) => {
            chain()
              .deleteRange(range)
              .insertContentAt(range.from, rule.replacement)
              .run();
          },
        })
    );

    return [
      ...directRules,
      ...boundaryRules.map(
        (rule) =>
          new InputRule({
            find: rule.find,
            handler: ({ chain, range }) => {
              chain()
                .deleteRange(range)
                .insertContentAt(range.from, rule.replacement)
                .run();
            },
          })
      ),
    ];
  },
});
