import { isConfigFile, isTestFile } from '../utils.mjs';

const ORIGIN =
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|(?:[a-z0-9-]+\.)*(?:tuturuuu|tutur3u)\.com|(?:[a-z0-9-]+\.)*vercel\.app)(?::\d+)?(?=\/|$)/i;
const SOURCE = /(?:^|[\\/])(?:apps|packages)[\\/][^\\/]+[\\/]src[\\/]/;
const DESTINATION_NAME =
  /(?:^|_)(?:API_URL|API_ENDPOINT|BASE_URL)$|(?:apiUrl|apiEndpoint|baseUrl|baseURL|endpoint)$/;

function isDestination(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      [
        'TemplateLiteral',
        'BinaryExpression',
        'LogicalExpression',
        'ConditionalExpression',
        'TSAsExpression',
      ].includes(parent.type)
    ) {
      current = parent;
      continue;
    }
    if (parent.type === 'CallExpression') {
      return (
        parent.callee.type === 'Identifier' &&
        parent.callee.name === 'fetch' &&
        parent.arguments[0] === current
      );
    }
    if (parent.type === 'VariableDeclarator') {
      return (
        parent.id.type === 'Identifier' && DESTINATION_NAME.test(parent.id.name)
      );
    }
    return false;
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Resolve runtime app destinations from configuration.',
    },
    schema: [],
    messages: {
      hardcodedOrigin:
        'Resolve runtime destination {{origin}} through the app URL helper or configured binding; retain its destination authorization checks.',
    },
  },
  create(context) {
    if (
      !SOURCE.test(context.filename) ||
      isTestFile(context.filename) ||
      isConfigFile(context.filename)
    )
      return {};
    function check(value, node) {
      const match = typeof value === 'string' && value.match(ORIGIN);
      if (match && isDestination(node))
        context.report({
          node,
          messageId: 'hardcodedOrigin',
          data: { origin: match[0] },
        });
    }
    return {
      Literal(node) {
        check(node.value, node);
      },
      TemplateLiteral(node) {
        for (const part of node.quasis) check(part.value.cooked, node);
      },
    };
  },
};
