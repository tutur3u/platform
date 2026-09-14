import {
  BookOpen,
  Boxes,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  Code2,
  Crown,
  Database,
  FileText,
  Folder,
  Gauge,
  GraduationCap,
  LayoutGrid,
  Link,
  ListTodo,
  Mail,
  MessageSquare,
  Network,
  Rocket,
  Server,
  ShoppingBag,
  Sparkles,
  Timer,
  Users,
  Video,
  Wrench,
} from '@tuturuuu/icons/lucide';
import type { ComparisonTier } from '@tuturuuu/utils/commercial-comparison';

interface ComparisonTierStyle {
  Icon: typeof Rocket;
  color: string;
  surface: string;
  column: string;
}

export const comparisonTierStyle = {
  free: {
    Icon: Rocket,
    color: 'text-dynamic-green',
    surface: 'border-dynamic-green/25 bg-dynamic-green/10',
    column: 'bg-dynamic-green/[0.025]',
  },
  plus: {
    Icon: Sparkles,
    color: 'text-dynamic-blue',
    surface: 'border-dynamic-blue/25 bg-dynamic-blue/10',
    column: 'bg-dynamic-blue/[0.035]',
  },
  pro: {
    Icon: Crown,
    color: 'text-dynamic-purple',
    surface: 'border-dynamic-purple/25 bg-dynamic-purple/10',
    column: 'bg-dynamic-purple/[0.035]',
  },
  enterprise: {
    Icon: Building2,
    color: 'text-dynamic-orange',
    surface: 'border-dynamic-orange/25 bg-dynamic-orange/10',
    column: 'bg-dynamic-orange/[0.025]',
  },
} satisfies Record<ComparisonTier, ComparisonTierStyle>;

const appIcons: Record<string, typeof LayoutGrid> = {
  capacity: Gauge,
  platform: LayoutGrid,
  tasks: ListTodo,
  calendar: CalendarDays,
  drive: Folder,
  ai: Sparkles,
  meet: Video,
  finance: CircleDollarSign,
  contacts: Users,
  inventory: Boxes,
  forms: FileText,
  chat: MessageSquare,
  track: Timer,
  mail: Mail,
  learn: BookOpen,
  teach: GraduationCap,
  rewise: GraduationCap,
  mind: BrainCircuit,
  hive: Network,
  cms: FileText,
  storefront: ShoppingBag,
  pay: CircleDollarSign,
  git: Code2,
  tools: Wrench,
  shortener: Link,
  nova: ChartNoAxesCombined,
  colab: Users,
  infrastructure: Server,
  database: Database,
  external: BriefcaseBusiness,
};
export function comparisonAppIcon(app: string) {
  return appIcons[app] ?? LayoutGrid;
}
export const comparisonFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
