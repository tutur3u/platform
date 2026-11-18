import {
  Brain,
  Calendar,
  ChartNoAxesCombined,
  ClipboardList,
  ContactRound,
  Folder,
  GraduationCap,
  Mail,
  MessageCircle,
  Package,
  Smartphone,
  Sparkles,
  Timer,
  Video,
  Wallet,
  ListChecks,
} from '@tuturuuu/icons';
import type { ProductKey } from './pulse-data';

const icons = {
  tasks: ClipboardList,
  calendar: Calendar,
  mail: Mail,
  meet: Video,
  chat: MessageCircle,
  drive: Folder,
  finance: Wallet,
  mira: Sparkles,
  mobile: Smartphone,
  contacts: ContactRound,
  inventory: Package,
  mind: Brain,
  nova: ChartNoAxesCombined,
  upskii: GraduationCap,
  track: Timer,
  forms: ListChecks,
};

export function ProductIcon({
  product,
  size = 22,
}: {
  product: ProductKey;
  size?: number;
}) {
  const Icon = icons[product];
  return <Icon aria-hidden="true" size={size} />;
}
