import {
  BarChart3,
  Braces,
  CalendarClock,
  ChartColumn,
  CheckCircle2,
  ClipboardList,
  Code2,
  Download,
  FileSpreadsheet,
  Globe2,
  Image as ImageIcon,
  LayoutTemplate,
  Link2,
  ListChecks,
  Lock,
  Mail,
  MessageSquare,
  MousePointerClick,
  Palette,
  PanelRightOpen,
  Play,
  Rows3,
  Share2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Split,
  Star,
  Type,
  Users,
  Workflow,
} from '@tuturuuu/icons';
import type { MarketingAccent } from '@tuturuuu/ui/marketing';
import type { ComponentType } from 'react';

/**
 * Landing page content, expressed as data.
 *
 * Sections render from these lists so adding a feature card or an embed mode is
 * a one-line change here plus two message keys, rather than new JSX. Copy lives
 * in `messages/*.json` under `forms.landing.*`; only the icon, accent and
 * message key live in code.
 */

export interface LandingItem {
  /** Message key segment under its section's namespace. */
  key: string;
  icon: ComponentType<{ className?: string }>;
  accent: MarketingAccent;
}

/** The end-to-end path a new form takes, rendered as a numbered rail. */
export const LANDING_WORKFLOW_STEPS: LandingItem[] = [
  { key: 'build', icon: LayoutTemplate, accent: 'purple' },
  { key: 'design', icon: Palette, accent: 'pink' },
  { key: 'share', icon: Share2, accent: 'blue' },
  { key: 'learn', icon: ChartColumn, accent: 'cyan' },
];

/** Question and content blocks available in the builder. */
export const LANDING_BLOCKS: LandingItem[] = [
  { key: 'short_text', icon: Type, accent: 'blue' },
  { key: 'long_text', icon: MessageSquare, accent: 'blue' },
  { key: 'choice', icon: ListChecks, accent: 'purple' },
  { key: 'dropdown', icon: Rows3, accent: 'purple' },
  { key: 'scale', icon: SlidersHorizontal, accent: 'cyan' },
  { key: 'rating', icon: Star, accent: 'yellow' },
  { key: 'date', icon: CalendarClock, accent: 'green' },
  { key: 'media', icon: ImageIcon, accent: 'orange' },
  { key: 'video', icon: Play, accent: 'red' },
  { key: 'rich_text', icon: Braces, accent: 'indigo' },
];

/** Logic and validation capabilities. */
export const LANDING_LOGIC_FEATURES: LandingItem[] = [
  { key: 'branching', icon: Split, accent: 'purple' },
  { key: 'section_end', icon: Workflow, accent: 'indigo' },
  { key: 'validation', icon: CheckCircle2, accent: 'green' },
  { key: 'scheduling', icon: CalendarClock, accent: 'orange' },
];

/** Embed modes offered by the embed builder. */
export const LANDING_EMBED_MODES: LandingItem[] = [
  { key: 'inline', icon: LayoutTemplate, accent: 'blue' },
  { key: 'fullpage', icon: Globe2, accent: 'cyan' },
  { key: 'popup', icon: MousePointerClick, accent: 'purple' },
  { key: 'slider', icon: PanelRightOpen, accent: 'pink' },
  { key: 'popover', icon: MessageSquare, accent: 'orange' },
  { key: 'sidetab', icon: Rows3, accent: 'green' },
];

/** Response handling and analysis. */
export const LANDING_INSIGHT_FEATURES: LandingItem[] = [
  { key: 'live', icon: BarChart3, accent: 'cyan' },
  { key: 'dropoff', icon: Split, accent: 'orange' },
  { key: 'export', icon: FileSpreadsheet, accent: 'green' },
  { key: 'receipts', icon: Mail, accent: 'blue' },
];

/** Trust and governance. */
export const LANDING_SECURITY_FEATURES: LandingItem[] = [
  { key: 'private_schema', icon: Lock, accent: 'green' },
  { key: 'access', icon: Shield, accent: 'blue' },
  { key: 'spam', icon: CheckCircle2, accent: 'purple' },
  { key: 'portable', icon: Download, accent: 'cyan' },
];

/** Collaboration highlights. */
export const LANDING_COLLABORATION_FEATURES: LandingItem[] = [
  { key: 'presence', icon: Users, accent: 'purple' },
  { key: 'locks', icon: Lock, accent: 'pink' },
  { key: 'autosave', icon: Sparkles, accent: 'blue' },
];

/** Developer surface. */
export const LANDING_DEVELOPER_FEATURES: LandingItem[] = [
  { key: 'sdk', icon: Code2, accent: 'indigo' },
  { key: 'share_link', icon: Link2, accent: 'blue' },
  { key: 'portable', icon: ClipboardList, accent: 'green' },
];

/** FAQ entries — answers live under `forms.landing.faq.items.<id>`. */
export const LANDING_FAQ_IDS = [
  'free',
  'anonymous',
  'embed',
  'realtime',
  'export',
  'languages',
] as const;

/** In-page nav anchors. */
export const LANDING_NAV_SECTIONS = [
  'workflow',
  'build',
  'design',
  'embed',
  'insights',
] as const;

/** Footer link columns — `href` values are resolved by the section. */
export const LANDING_FOOTER_COLUMNS = [
  { id: 'product', links: ['workflow', 'build', 'design', 'embed'] },
  { id: 'platform', links: ['tuturuuu', 'tasks', 'calendar', 'docs'] },
  { id: 'legal', links: ['terms', 'privacy', 'security', 'contact'] },
] as const;
