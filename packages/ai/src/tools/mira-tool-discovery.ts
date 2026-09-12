import { DEV_MODE } from '@tuturuuu/utils/constants';
import { MIRA_TOOL_DIRECTORY } from './mira-tool-metadata';
import type { MiraToolName } from './mira-tool-names';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/_/g, ' ');
const domains = {
  tasks: {
    keywords:
      'task tasks board list label project assignee assign priority deadline cong viec nhiem vu nhan du an',
    matches: /task|board|project/,
    guidance:
      'Discover board/list and member/label/project IDs before writes. Tasks require a list. Read a task before editing ambiguous fields. Use assignment tools for labels, projects, and people. Dates use the user timezone. Keep operations in the requested workspace; report the workspace and resulting task ID after creation.',
  },
  calendar: {
    keywords:
      'calendar event schedule scheduling google microsoft sync reclaim lock availability habit focus meeting lich dong bo su kien',
    matches: /calendar|event|schedule|e2ee/,
    guidance:
      'Use existing connected accounts; an unconnected Google account needs user OAuth consent. Inspect sync health before retrying. Locked events must stay fixed. Preview scheduling before applying it; preserve hard commitments and explain conflicts. Use actual priorities, deadlines, availability, and durations, never invented free time.',
  },
  finance: {
    keywords:
      'finance wallet transaction money expense income currency category tag tai chinh vi giao dich',
    matches: /wallet|transaction|spending|currency/,
    guidance:
      'Discover wallets and categories before writes. Positive amounts are income, negative amounts expenses. Keep currencies separate. Report actual tool outcomes and never infer a successful financial write from a visualization.',
  },
  time: {
    keywords: 'time timer tracking goal hours duration thoi gian theo doi',
    matches: /timer|time_track/,
    guidance:
      'Discover categories and sessions before edits. Respect the user timezone and running session state. Use history pagination and date filters to keep results small.',
  },
  memory: {
    keywords:
      'memory remember recall preference personality name settings nho so thich',
    matches: /memor|recall|remember|settings|user_name/,
    guidance:
      'Recall relevant memories before personalization. Store durable preferences, not transient tool output. Behavior settings use update_my_settings; user naming uses update_user_name. Avoid duplicate memories.',
  },
  workspace: {
    keywords:
      'workspace member context sidebar artifact panel theme layout screen khong gian thanh ben giao dien',
    matches: /workspace|sidebar|theme|immersive/,
    guidance:
      'Resolve named workspaces before operations. Opening artifacts fetches data in the UI, not in the model. Keep explanations in chat. Make each UI change once and finish after success. Replace a panel with close_artifact plus show_workspace_artifact; focus_artifact closes all other panels.',
  },
  creative: {
    keywords:
      'image qr file document convert markdown visualization render hinh anh tep tai lieu',
    matches: /image|qr_code|convert_file|render_ui/,
    guidance:
      'Use Markdown for code, math, diagrams, and tables. Convert attached documents when their contents are needed. Google models receive YouTube URLs as video input; do not send YouTube links to file conversion. Use image generation only for requested images.',
  },
  research: {
    keywords:
      'search web current news weather research verify tim kiem tin tuc thoi tiet',
    matches: /google_search|parallel_checks/,
    guidance:
      'Use web search for current external facts and cite sources. Use parallel checks for explicit deeper verification; summarize the results rather than dumping raw output.',
  },
} as const;

export function searchMiraTools(
  args: { query: string; limit?: number },
  allowed?: ReadonlySet<string>
) {
  const query = normalize(args.query);
  const terms = query
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 2);
  const matchingDomains = Object.entries(domains).filter(([, domain]) =>
    terms.some((term) => normalize(domain.keywords).split(' ').includes(term))
  );
  const matches = (
    Object.entries(MIRA_TOOL_DIRECTORY) as [MiraToolName, string][]
  )
    .filter(
      ([name]) =>
        !['search_tools', 'select_tools', 'no_action_needed'].includes(name) &&
        (DEV_MODE || name !== 'render_ui') &&
        (!allowed || allowed.has(name))
    )
    .map(([name, description]) => {
      const words = normalize(`${name} ${description}`).split(
        /[^\p{L}\p{N}]+/u
      );
      const nameWords = normalize(name).split(' ');
      const score =
        (normalize(name) === query ? 100 : 0) +
        terms.reduce(
          (total, term) =>
            total +
            (nameWords.some((word) => word.startsWith(term))
              ? 6
              : words.some((word) => word.startsWith(term))
                ? 2
                : 0),
          0
        ) +
        matchingDomains.reduce(
          (total, [, domain]) => total + (domain.matches.test(name) ? 1 : 0),
          0
        );
      return { name, description, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, Math.min(8, Math.max(1, args.limit ?? 6)));
  return {
    ok: true,
    selectedTools: matches.map(({ name }) => name),
    matches: matches.map(({ name, description }) => ({ name, description })),
    guidance: matchingDomains.map(([domain, { guidance }]) => ({
      domain,
      guidance,
    })),
    ...(matches.length
      ? {
          next: 'Use the activated tools. Search again only for a different operation or missing capability.',
        }
      : {
          next: 'No matching authorized tools. Try a specific app or operation.',
          domains: Object.keys(domains),
        }),
  };
}
