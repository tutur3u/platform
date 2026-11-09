/**
 * require-suppression-reason
 *
 * Every `eslint-disable` / `oxlint-disable` (including `-next-line` and `-line`
 * variants, in both line and block comments) must carry a reason after `--`.
 *
 *   // oxlint-disable-next-line no-console -- legacy logging path
 *
 * A comment is considered to have a reason when its text contains `--` after
 * the directive. Shebang comments are ignored.
 */
const DIRECTIVE_RE = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?\b/;

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require a reason on eslint-disable / oxlint-disable comments.',
      category: 'correctness',
      recommended: true,
    },
    messages: {
      missingReason:
        'Add a reason after "--" to this {{directive}} comment, e.g. "// {{directive}} rule -- why this rule is disabled here".',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type === 'Shebang') {
            continue;
          }

          const value = comment.value.trim();
          const match = value.match(DIRECTIVE_RE);

          if (!match) {
            continue;
          }

          // `--` marks the start of the reason.
          if (value.split('--').slice(1).join('--').trim()) {
            continue;
          }

          context.report({
            node: comment,
            messageId: 'missingReason',
            data: { directive: match[0].trim() },
          });
        }
      },
    };
  },
};
