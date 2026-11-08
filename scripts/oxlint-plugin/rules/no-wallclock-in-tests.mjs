import { isTestFile } from '../utils.mjs';

/**
 * no-wallclock-in-tests
 *
 * Disallow wall-clock reads and real timers in test files so tests stay
 * deterministic and fast. Suggests fake timers (Vitest: `vi.useFakeTimers()` /
 * `vi.setSystemTime()`).
 *
 * Flagged:
 *   - `Date.now()`
 *   - `new Date()` with no arguments (reads the wall clock)
 *   - `setTimeout` / `setInterval` (covers setTimeout-based polling loops; a
 *     broader, but deterministic, superset — see RULES.md)
 *
 * Not flagged: `new Date('2026-01-01')`, `new Date(0)`, `Date.parse(...)`,
 * and any of the above outside `*.test.*` / `*.spec.*` files.
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow wall-clock reads and real timers in test files; use fake timers.',
      category: 'correctness',
      recommended: true,
    },
    messages: {
      dateNow:
        'Avoid Date.now() in tests. Use fake timers (vi.useFakeTimers() / vi.setSystemTime()) for deterministic time.',
      newDate:
        'Avoid new Date() with no arguments in tests. Use fake timers (vi.useFakeTimers() / vi.setSystemTime()) for deterministic time.',
      timer:
        'Avoid real timers ({{name}}) in tests. Use fake timers (vi.useFakeTimers()) and advance them explicitly.',
    },
    schema: [],
  },

  create(context) {
    if (!isTestFile(context.filename)) {
      return {};
    }

    return {
      CallExpression(node) {
        const callee = node.callee;

        if (
          callee?.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object?.type === 'Identifier' &&
          callee.object.name === 'Date' &&
          callee.property?.type === 'Identifier' &&
          callee.property.name === 'now'
        ) {
          context.report({ node, messageId: 'dateNow' });
          return;
        }

        if (
          callee?.type === 'Identifier' &&
          (callee.name === 'setTimeout' || callee.name === 'setInterval')
        ) {
          context.report({
            node,
            messageId: 'timer',
            data: { name: callee.name },
          });
        }
      },

      NewExpression(node) {
        if (
          node.callee?.type === 'Identifier' &&
          node.callee.name === 'Date' &&
          node.arguments.length === 0
        ) {
          context.report({ node, messageId: 'newDate' });
        }
      },
    };
  },
};
