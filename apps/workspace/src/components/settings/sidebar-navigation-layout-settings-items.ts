import {
  Archive,
  BadgeDollarSign,
  Blocks,
  BookUser,
  Bot,
  BrainCircuit,
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
  Settings,
  SquaresIntersect,
  Timer,
} from '@tuturuuu/icons';
import {
  getSidebarCategory,
  type SidebarCategoryId,
} from '@tuturuuu/ui/custom/sidebar-categories';
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
  | 'items.hive'
  | 'items.inventory'
  | 'items.link_shortener'
  | 'items.mail'
  | 'items.meet'
  | 'items.mind'
  | 'items.qr_generator'
  | 'items.settings'
  | 'items.tasks'
  | 'items.time_tracker'
  | 'items.whiteboards';
type SidebarSectionKey = SidebarCategoryId;
type SidebarLayoutTranslate = (key: SidebarLayoutItemKey) => string;
type SidebarSectionTranslate = (key: SidebarSectionKey) => string;

export function createSidebarNavigationItemDefinitions(
  t: SidebarLayoutTranslate,
  tSections: SidebarSectionTranslate,
  options?: { includeHive?: boolean }
): NavigationItemDefinition[] {
  const includeHive = options?.includeHive ?? false;
  const sections: Record<SidebarCategoryId, string> = {
    ai: tSections('ai'),
    communication: tSections('communication'),
    files_content: tSections('files_content'),
    operations: tSections('operations'),
    overview: tSections('overview'),
    productivity: tSections('productivity'),
    utilities: tSections('utilities'),
  };

  const definitions: Omit<NavigationItemDefinition, 'sectionLabel'>[] = [
    {
      id: 'dashboard',
      title: t('items.dashboard'),
      icon: ChartArea,
      defaultPlacement: 'root',
      locked: true,
    },
    {
      id: 'tasks',
      title: t('items.tasks'),
      icon: CheckCircle2,
      defaultPlacement: 'root',
    },
    {
      id: 'calendar',
      title: t('items.calendar'),
      icon: Calendar,
      defaultPlacement: 'root',
    },
    {
      id: 'time_tracker',
      title: t('items.time_tracker'),
      icon: Timer,
      defaultPlacement: 'more',
    },
    {
      id: 'forms',
      title: t('items.forms'),
      icon: ClipboardList,
      defaultPlacement: 'more',
    },
    {
      id: 'documents',
      title: t('items.documents'),
      icon: FileText,
      defaultPlacement: 'more',
    },
    {
      id: 'mail',
      title: t('items.mail'),
      icon: Mail,
      defaultPlacement: 'more',
    },
    {
      id: 'chat',
      title: t('items.chat'),
      icon: MessageCircleIcon,
      defaultPlacement: 'more',
    },
    {
      id: 'meet',
      title: t('items.meet'),
      icon: SquaresIntersect,
      defaultPlacement: 'more',
    },
    {
      id: 'contacts',
      title: t('items.contacts'),
      icon: BookUser,
      defaultPlacement: 'root',
    },
    {
      id: 'finance',
      title: t('items.finance'),
      icon: BadgeDollarSign,
      defaultPlacement: 'root',
    },
    {
      id: 'inventory',
      title: t('items.inventory'),
      icon: Archive,
      defaultPlacement: 'more',
    },
    {
      id: 'drive',
      title: t('items.drive'),
      icon: HardDrive,
      defaultPlacement: 'more',
    },
    {
      id: 'whiteboards',
      title: t('items.whiteboards'),
      icon: PencilRuler,
      defaultPlacement: 'more',
    },
    {
      id: 'mind',
      title: t('items.mind'),
      icon: BrainCircuit,
      defaultPlacement: 'more',
    },
    ...(includeHive
      ? [
          {
            id: 'hive',
            title: t('items.hive'),
            icon: Blocks,
            defaultPlacement: 'more',
          } satisfies Omit<NavigationItemDefinition, 'sectionLabel'>,
        ]
      : []),
    {
      id: 'ai_lab',
      title: t('items.ai_lab'),
      icon: Bot,
      defaultPlacement: 'more',
    },
    {
      id: 'qr_generator',
      title: t('items.qr_generator'),
      icon: QrCodeIcon,
      defaultPlacement: 'more',
    },
    {
      id: 'link_shortener',
      title: t('items.link_shortener'),
      icon: Link,
      defaultPlacement: 'more',
    },
    {
      id: 'settings',
      title: t('items.settings'),
      icon: Settings,
      defaultPlacement: 'root',
      locked: true,
    },
  ];

  return definitions.map((definition) => ({
    ...definition,
    sectionLabel: sections[getSidebarCategory(definition.id)],
  }));
}
