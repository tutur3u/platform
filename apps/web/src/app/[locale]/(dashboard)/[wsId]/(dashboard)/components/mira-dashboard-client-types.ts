export interface MiraDashboardClientProps {
  currentUser: {
    avatar_url?: string | null;
    display_name?: string | null;
    email?: string | null;
    full_name?: string | null;
    id: string;
  };
  initialAssistantName: string;
  /** Validated `?prompt=` draft for the composer (see mira-draft-prompt.ts). */
  initialDraft?: string;
  /**
   * `page` fills the viewport. `embedded` is a bounded panel inside the
   * workspace overview so the cards below stay reachable.
   */
  variant?: 'page' | 'embedded';
  wsId: string;
}

/**
 * Bounded Mira panel height inside the workspace overview: a tall panel in the
 * main column, and a compact composer-first dock when the dashboard is phone
 * width (the overview docks it to the bottom there).
 */
export const MIRA_EMBEDDED_HEIGHT_CLASS =
  'h-[min(40rem,calc(100dvh-8rem))] min-h-[26rem] @max-[40rem]/dashboard:h-[min(18rem,45dvh)] @max-[40rem]/dashboard:min-h-[13rem]';
