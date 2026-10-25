#!/usr/bin/env node
// Classifies changed paths for security CI. Pure functions are exported for the
// PR scan scope (security-checks.yaml, codeql.yml) and for the base-branch
// security review classifier (security-review-classifier.yaml).
const fs = require('node:fs');

const { env } = process;

// Paths whose changes need an independent security review before merge. The
// owner is a role used by the findings register, not a person.
const reviewCategories = [
  {
    category: 'ci',
    owner: 'ci-cd',
    patterns: [
      /^\.github\//u,
      /^scripts\/ci\//u,
      /^scripts\/git-[\w-]+\.(?:c|m)?[jt]s$/u,
      /^tuturuuu(?:\.ci)?\.ts$/u,
      /^turbo\.json$/u,
      /(?:^|\/)CODEOWNERS$/u,
      /^\.gitleaks[^/]*$/u,
    ],
  },
  {
    category: 'auth',
    owner: 'platform-auth',
    patterns: [
      /^packages\/(?:auth|sso|satellite|turnstile|start-bridge)\//u,
      /(?:^|\/)(?:auth|sso|oauth2?|sessions?|login|logout|sign-?in|sign-?up|mfa|otp|2fa|passkeys?|webauthn)(?:\/|[._-][^/]*$|$)/iu,
      /(?:^|\/)(?:proxy|middleware|api-middleware|authorization)\.(?:c|m)?[jt]s$/u,
      /(?:^|\/)(?:oidc|external-apps)[^/]*\.(?:c|m)?[jt]sx?$/iu,
      /(?:^|\/)[^/]*-auth\.(?:c|m)?[jt]sx?$/u,
      /^packages\/utils\/src\/(?:user-helper|workspace-user-link|api-proxy-guard|required-mfa)/u,
    ],
  },
  {
    category: 'rls-database',
    owner: 'database',
    patterns: [
      /^apps\/database\//u,
      /^packages\/supabase\//u,
      /(?:^|\/)[^/]*(?:rls|polic(?:y|ies))[^/]*$/iu,
    ],
  },
  {
    category: 'tenant-isolation',
    owner: 'platform',
    patterns: [
      /(?:^|\/)[^/]*(?:tenant|permission|rbac|workspace-(?:user|member|role|access))[^/]*$/iu,
      /^packages\/utils\/src\/workspace-helper/u,
      /^apps\/calendar\/src\/app\/api\/v1\/workspaces\/[^/]+\/calendar\/(?:sync|schedule)\//u,
      /^apps\/web\/src\/app\/api\/notifications\/send-immediate\//u,
    ],
  },
  {
    category: 'runner-sandbox',
    owner: 'runtime',
    patterns: [
      /^apps\/(?:devbox-control|cron-control|coordination|playground|storage-unzip-proxy)\//u,
      /^packages\/(?:devbox|trigger|workflows)\//u,
      /^apps\/(?:web|infrastructure)\/src\/lib\/devboxes\//u,
      /(?:^|\/)Dockerfile[^/]*$/u,
      /(?:^|\/)wrangler\.(?:toml|jsonc?)$/u,
    ],
  },
  {
    category: 'tokens-secrets',
    owner: 'platform-auth',
    patterns: [
      /(?:^|\/)[^/]*(?:token|secret|credential|crypto|encrypt|decrypt|signing|signature|hmac|jwt|api-?keys?)[^/]*$/iu,
      /(?:^|\/)\.env(?:\.[\w.-]+)?$/u,
      /(?:^|\/)email-unsubscribe\.(?:c|m)?[jt]s$/u,
      /(?:^|\/)\.dev\.vars/u,
    ],
  },
  {
    // Jobs authenticated by the cron secret, their gateways and run-now hooks.
    category: 'scheduled-jobs',
    owner: 'runtime',
    patterns: [
      /^apps\/[^/]+\/src\/app\/api\/cron\//u,
      /^apps\/web\/src\/legacy-api-routes\/cron\//u,
      /(?:^|\/)(?:[^/]*[-_])?cron(?:[-_][^/]*)?\.(?:c|m)?[jt]s$/u,
      /^apps\/infrastructure\/src\/app\/api\/v1\/infrastructure\/post-email-queue\//u,
    ],
  },
  {
    // Payment flows, including apps/pay/src/app/api/payment/webhooks.
    category: 'payments',
    owner: 'payments',
    patterns: [
      /^packages\/payment(?:-core)?\//u,
      /^apps\/pay\/src\/app\/api\/(?:payment|billing|cron\/payment)\//u,
      /(?:^|\/)sepay[^/]*\.(?:c|m)?[jt]s$/u,
    ],
  },
  {
    // Every inbound webhook and mail ingress (signature checks, replay).
    category: 'inbound-webhooks',
    owner: 'platform',
    patterns: [
      /(?:^|\/)webhooks?(?:\/|[._-][^/]*$|$)/iu,
      /^apps\/mail\/src\/lib\/mail\/inbound\//u,
    ],
  },
  {
    category: 'storage',
    owner: 'storage',
    patterns: [
      /^packages\/storage-core\//u,
      /^apps\/drive\//u,
      /(?:^|\/)[^/]*(?:storage|upload|bucket|presign|signed-url)[^/]*(?:\/|$)/iu,
    ],
  },
];

// Prose and translations describe behavior but cannot change it.
// Review evidence images are inert; .github/screenshots holds PR screenshots.
const reviewExempt = [
  /\.mdx?$/u,
  /(?:^|\/)messages\/[^/]+\.json$/u,
  /^\.github\/screenshots\/(?:[^/]+\/)*[^/]+\.(?:png|jpe?g|webp|gif)$/u,
];

const dependencyPatterns = [
  /(?:^|\/)package\.json$/u,
  /(?:^|\/)bun\.lockb?$/u,
  /(?:^|\/)bunfig\.toml$/u,
  /(?:^|\/)\.npmrc$/u,
  /^patches\//u,
  /(?:^|\/)(?:uv\.lock|pyproject\.toml|requirements[^/]*\.txt)$/u,
  /(?:^|\/)pubspec\.(?:yaml|lock)$/u,
  /(?:^|\/)Cargo\.(?:toml|lock)$/u,
  /(?:^|\/)package-lock\.json$/u,
];

const codeqlLanguages = {
  actions: [/^\.github\/(?:workflows|actions)\/.+\.ya?ml$/u],
  'javascript-typescript': [/\.(?:c|m)?[jt]sx?$/u, /\.vue$/u, /\.html?$/u],
  python: [/\.py$/u, /(?:^|\/)(?:uv\.lock|pyproject\.toml)$/u],
};

// Matches GitHub's per-PR file listing ceiling; beyond it the list is partial.
const maxListedFiles = 3000;

function normalize(filePath) {
  return String(filePath).replace(/\\/gu, '/').replace(/^\.\//u, '').trim();
}

function matchesAny(patterns, filePath) {
  return patterns.some((pattern) => pattern.test(filePath));
}

function classifyReview(paths, { truncated = false } = {}) {
  const byCategory = new Map();
  for (const raw of paths) {
    const filePath = normalize(raw);
    if (!filePath || matchesAny(reviewExempt, filePath)) continue;
    for (const { category, owner, patterns } of reviewCategories) {
      if (!matchesAny(patterns, filePath)) continue;
      const entry = byCategory.get(category) ?? { category, owner, paths: [] };
      entry.paths.push(filePath);
      byCategory.set(category, entry);
    }
  }
  const categories = [...byCategory.values()];
  if (truncated) {
    categories.push({
      category: 'file-list-truncated',
      owner: 'ci-cd',
      paths: [],
    });
  }
  return { categories, required: categories.length > 0 };
}

function ownerForPath(filePath) {
  const normalized = normalize(filePath);
  return (
    reviewCategories.find(({ patterns }) => matchesAny(patterns, normalized))
      ?.owner ?? 'security-integration-owner'
  );
}

// Scan scope for PR/push checks. Unknown change sets scan everything.
function classifyScope(paths, { full = false } = {}) {
  if (full || paths === null) {
    return {
      codeqlLanguages: Object.keys(codeqlLanguages),
      dependencies: true,
      workflows: true,
    };
  }
  const files = paths.map(normalize).filter(Boolean);
  return {
    codeqlLanguages: Object.entries(codeqlLanguages)
      .filter(([, patterns]) =>
        files.some((file) => matchesAny(patterns, file))
      )
      .map(([language]) => language),
    dependencies: files.some((file) => matchesAny(dependencyPatterns, file)),
    workflows: files.some((file) => /^(?:\.github|scripts\/ci)\//u.test(file)),
  };
}

function readChangedFiles(file) {
  if (!file || !fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

function main(argv = process.argv.slice(2)) {
  const [command] = argv;
  if (command !== 'scope') {
    throw new Error('usage: security-paths.js scope');
  }
  const event = env.GITHUB_EVENT_NAME;
  const full = !['pull_request', 'push'].includes(event);
  const scope = classifyScope(readChangedFiles(env.CHANGED_FILES_FILE), {
    full,
  });
  const output = [
    `codeql_languages=${JSON.stringify(scope.codeqlLanguages)}`,
    `codeql=${scope.codeqlLanguages.length > 0}`,
    `dependencies=${scope.dependencies}`,
    `workflows=${scope.workflows}`,
  ];
  console.log(output.join('\n'));
  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(env.GITHUB_OUTPUT, `${output.join('\n')}\n`);
  }
}

if (require.main === module) main();

module.exports = {
  classifyReview,
  classifyScope,
  maxListedFiles,
  normalize,
  ownerForPath,
  reviewCategories,
};
