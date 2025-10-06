export type MentionOptionType =
  | 'user'
  | 'workspace'
  | 'task'
  | 'project'
  | 'date'
  | 'external-user';

export interface MentionOption {
  id: string;
  label: string;
  subtitle?: string;
  avatarUrl?: string | null;
  type: MentionOptionType;
  payload?: Record<string, unknown>;
}

export interface SuggestionRange {
  from: number;
  to: number;
}

export interface SuggestionState {
  open: boolean;
  query: string;
  range: SuggestionRange | null;
  position: { left: number; top: number } | null;
}

export const mentionGroupOrder: Array<{
  type: MentionOptionType;
  title: string;
}> = [
  { type: 'user', title: 'People' },
  { type: 'external-user', title: 'External Users' },
  { type: 'workspace', title: 'Workspaces' },
  { type: 'project', title: 'Projects' },
  { type: 'task', title: 'Tasks' },
  { type: 'date', title: 'Dates' },
];

export const mentionTypeStyles: Record<
  MentionOptionType,
  {
    badgeClass: string;
    avatarFallback: string;
    avatarClass: string;
    prefix: string;
  }
> = {
  user: {
    badgeClass:
      'border border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green',
    avatarFallback: '@',
    avatarClass:
      'bg-dynamic-green/20 text-dynamic-green border border-dynamic-green/30',
    prefix: '@',
  },
  workspace: {
    badgeClass:
      'border border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange',
    avatarFallback: 'W',
    avatarClass:
      'bg-dynamic-orange/20 text-dynamic-orange border border-dynamic-orange/30',
    prefix: '@',
  },
  project: {
    badgeClass:
      'border border-dynamic-cyan/40 bg-dynamic-cyan/10 text-dynamic-cyan',
    avatarFallback: 'P',
    avatarClass:
      'bg-dynamic-cyan/20 text-dynamic-cyan border border-dynamic-cyan/30',
    prefix: '@',
  },
  task: {
    badgeClass:
      'border border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue',
    avatarFallback: '#',
    avatarClass:
      'bg-dynamic-blue/20 text-dynamic-blue border border-dynamic-blue/30',
    prefix: '#',
  },
  date: {
    badgeClass:
      'border border-dynamic-pink/40 bg-dynamic-pink/10 text-dynamic-pink',
    avatarFallback: 'D',
    avatarClass:
      'bg-dynamic-pink/20 text-dynamic-pink border border-dynamic-pink/30',
    prefix: '@',
  },
  'external-user': {
    badgeClass: 'border border-border bg-muted text-muted-foreground',
    avatarFallback: '@',
    avatarClass: 'bg-muted text-muted-foreground border border-border',
    prefix: '@',
  },
};

export const createInitialSuggestionState = (): SuggestionState => ({
  open: false,
  query: '',
  range: null,
  position: null,
});

export const isSameSuggestionState = (
  a: SuggestionState,
  b: SuggestionState
): boolean => {
  if (a.open !== b.open) return false;
  if (a.query !== b.query) return false;

  if (!!a.range !== !!b.range) return false;
  if (
    a.range &&
    b.range &&
    (a.range.from !== b.range.from || a.range.to !== b.range.to)
  ) {
    return false;
  }

  if (!!a.position !== !!b.position) return false;
  if (
    a.position &&
    b.position &&
    (a.position.left !== b.position.left || a.position.top !== b.position.top)
  ) {
    return false;
  }

  return true;
};

// Normalize text for search: remove diacritics and convert to lowercase
export const normalizeForSearch = (text: string): string => {
  return text
    .normalize('NFD') // Decompose combined characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .toLowerCase()
    .trim();
};
