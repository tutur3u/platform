import {
  Archive,
  BadgeDollarSign,
  Blocks,
  BookUser,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Calendar,
  ChartArea,
  CheckCircle2,
  ClipboardList,
  FileText,
  HardDrive,
  Link,
  Mail,
  MessageCircleIcon,
  PencilRuler,
  QrCodeIcon,
  Repeat,
  ScreenShare,
  Settings,
  SquaresIntersect,
  Timer,
  Users,
  Vote,
} from '@tuturuuu/icons';
import type { NavigationItemDefinition } from './sidebar-navigation-layout-settings.types';

type SidebarLayoutItemKey =
  | 'items.ai_lab'
  | 'items.calendar'
  | 'items.chat'
  | 'items.contacts'
  | 'items.dashboard'
  | 'items.documents'
  | 'items.drive'
  | 'items.finance'
  | 'items.forms'
  | 'items.google_workspace'
  | 'items.habits'
  | 'items.hive'
  | 'items.inventory'
  | 'items.link_shortener'
  | 'items.mail'
  | 'items.meet'
  | 'items.mind'
  | 'items.polls'
  | 'items.qr_generator'
  | 'items.settings'
  | 'items.tasks'
  | 'items.time_tracker'
  | 'items.users'
  | 'items.whiteboards'
  | 'items.workforce';
type SidebarSectionKey =
  | 'ai'
  | 'core'
  | 'operations'
  | 'utilities'
  | 'work_tools';
type SidebarLayoutTranslate = (key: SidebarLayoutItemKey) => string;
type SidebarSectionTranslate = (key: SidebarSectionKey) => string;

export function createSidebarNavigationItemDefinitions(
  t: SidebarLayoutTranslate,
  tSections: SidebarSectionTranslate,
  options?: { includeHive?: boolean }
): NavigationItemDefinition[] {
  const includeHive = options?.includeHive ?? false;
  const sections = {
    ai: tSections('ai'),
    core: tSections('core'),
    operations: tSections('operations'),
    utilities: tSections('utilities'),
    workTools: tSections('work_tools'),
  };

  return [
    {
      id: 'dashboard',
      title: t('items.dashboard'),
      icon: ChartArea,
      defaultPlacement: 'root',
      locked: true,
      sectionLabel: sections.core,
    },
    {
      id: 'tasks',
      title: t('items.tasks'),
      icon: CheckCircle2,
      defaultPlacement: 'root',
      sectionLabel: sections.core,
    },
    {
      id: 'calendar',
      title: t('items.calendar'),
      icon: Calendar,
      defaultPlacement: 'root',
      sectionLabel: sections.core,
    },
    {
      id: 'contacts',
      title: t('items.contacts'),
      icon: BookUser,
      defaultPlacement: 'root',
      sectionLabel: sections.core,
    },
    {
      id: 'finance',
      title: t('items.finance'),
      icon: BadgeDollarSign,
      defaultPlacement: 'root',
      sectionLabel: sections.core,
    },
    {
      id: 'habits',
      title: t('items.habits'),
      icon: Repeat,
      defaultPlacement: 'more',
      sectionLabel: sections.workTools,
    },
    {
      id: 'whiteboards',
      title: t('items.whiteboards'),
      icon: PencilRuler,
      defaultPlacement: 'more',
      sectionLabel: sections.workTools,
    },
    {
      id: 'time_tracker',
      title: t('items.time_tracker'),
      icon: Timer,
      defaultPlacement: 'more',
      sectionLabel: sections.workTools,
    },
    {
      id: 'drive',
      title: t('items.drive'),
      icon: HardDrive,
      defaultPlacement: 'more',
      sectionLabel: sections.workTools,
    },
    {
      id: 'forms',
      title: t('items.forms'),
      icon: ClipboardList,
      defaultPlacement: 'more',
      sectionLabel: sections.workTools,
    },
    {
      id: 'documents',
      title: t('items.documents'),
      icon: FileText,
      defaultPlacement: 'more',
      sectionLabel: sections.workTools,
    },
    {
      id: 'mind',
      title: t('items.mind'),
      icon: BrainCircuit,
      defaultPlacement: 'more',
      sectionLabel: sections.ai,
    },
    ...(includeHive
      ? [
          {
            id: 'hive',
            title: t('items.hive'),
            icon: Blocks,
            defaultPlacement: 'more',
            sectionLabel: sections.ai,
          } satisfies NavigationItemDefinition,
        ]
      : []),
    {
      id: 'chat',
      title: t('items.chat'),
      icon: MessageCircleIcon,
      defaultPlacement: 'more',
      sectionLabel: sections.ai,
    },
    {
      id: 'ai_lab',
      title: t('items.ai_lab'),
      icon: Bot,
      defaultPlacement: 'more',
      sectionLabel: sections.ai,
    },
    {
      id: 'workforce',
      title: t('items.workforce'),
      icon: BriefcaseBusiness,
      defaultPlacement: 'more',
      sectionLabel: sections.operations,
    },
    {
      id: 'users',
      title: t('items.users'),
      icon: Users,
      defaultPlacement: 'more',
      sectionLabel: sections.operations,
    },
    {
      id: 'inventory',
      title: t('items.inventory'),
      icon: Archive,
      defaultPlacement: 'more',
      sectionLabel: sections.operations,
    },
    {
      id: 'qr_generator',
      title: t('items.qr_generator'),
      icon: QrCodeIcon,
      defaultPlacement: 'more',
      sectionLabel: sections.utilities,
    },
    {
      id: 'google_workspace',
      title: t('items.google_workspace'),
      icon: ScreenShare,
      defaultPlacement: 'more',
      sectionLabel: sections.utilities,
    },
    {
      id: 'meet',
      title: t('items.meet'),
      icon: SquaresIntersect,
      defaultPlacement: 'more',
      sectionLabel: sections.utilities,
    },
    {
      id: 'polls',
      title: t('items.polls'),
      icon: Vote,
      defaultPlacement: 'more',
      sectionLabel: sections.utilities,
    },
    {
      id: 'mail',
      title: t('items.mail'),
      icon: Mail,
      defaultPlacement: 'more',
      sectionLabel: sections.utilities,
    },
    {
      id: 'link_shortener',
      title: t('items.link_shortener'),
      icon: Link,
      defaultPlacement: 'more',
      sectionLabel: sections.utilities,
    },
    {
      id: 'settings',
      title: t('items.settings'),
      icon: Settings,
      defaultPlacement: 'root',
      locked: true,
      sectionLabel: sections.utilities,
    },
  ];
}
