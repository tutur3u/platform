import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';

export const REQUIRE_ATTENTION_COLOR_CONFIG_ID =
  'USER_FEEDBACK_REQUIRE_ATTENTION_COLOR';

export const DEFAULT_REQUIRE_ATTENTION_COLOR: SupportedColor = 'ORANGE';

export const REQUIRE_ATTENTION_TEXT_CLASS_BY_COLOR: Record<
  SupportedColor,
  string
> = {
  RED: 'text-dynamic-red',
  ORANGE: 'text-dynamic-orange',
  YELLOW: 'text-dynamic-yellow',
  GREEN: 'text-dynamic-green',
  BLUE: 'text-dynamic-blue',
  PURPLE: 'text-dynamic-purple',
  PINK: 'text-dynamic-pink',
  INDIGO: 'text-dynamic-indigo',
  CYAN: 'text-dynamic-cyan',
  GRAY: 'text-dynamic-gray',
};

const SUPPORTED_FEEDBACK_COLORS = new Set<SupportedColor>(
  Object.keys(REQUIRE_ATTENTION_TEXT_CLASS_BY_COLOR) as SupportedColor[]
);

export interface FeedbackPerson {
  id: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
}

export interface WorkspaceUserFeedback {
  id: string;
  user_id: string;
  group_id: string;
  creator_id: string | null;
  content: string;
  require_attention: boolean;
  created_at: string;
  user: FeedbackPerson | null;
  creator: FeedbackPerson | null;
  group: {
    id: string;
    name: string | null;
  } | null;
  user_name: string;
  creator_name: string;
  group_name: string;
}

export interface WorkspaceUserFeedbacksResponse {
  data: WorkspaceUserFeedback[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function parseRequireAttentionColor(
  value: string | null | undefined
): SupportedColor {
  if (!value) {
    return DEFAULT_REQUIRE_ATTENTION_COLOR;
  }

  return SUPPORTED_FEEDBACK_COLORS.has(value as SupportedColor)
    ? (value as SupportedColor)
    : DEFAULT_REQUIRE_ATTENTION_COLOR;
}

export function getRequireAttentionTextClass(color: string | null | undefined) {
  return REQUIRE_ATTENTION_TEXT_CLASS_BY_COLOR[
    parseRequireAttentionColor(color)
  ];
}

export function getWorkspaceUserDisplayName(person?: {
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
}) {
  return (
    person?.full_name?.trim() ||
    person?.display_name?.trim() ||
    person?.email?.trim() ||
    'Unknown User'
  );
}
