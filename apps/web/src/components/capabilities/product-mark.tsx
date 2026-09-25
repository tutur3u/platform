import {
  BookOpen,
  Boxes,
  BrainCircuit,
  CalendarDays,
  Code2,
  FileText,
  Folder,
  GraduationCap,
  LayoutGrid,
  Link,
  Mail,
  MessageSquare,
  Network,
  Server,
  ShoppingBag,
  Sparkles,
  Timer,
  Users,
  Video,
  Wallet,
  Wrench,
} from '@tuturuuu/icons/lucide';

const appIcons: Record<string, typeof LayoutGrid> = {
  calendar: CalendarDays,
  mail: Mail,
  meet: Video,
  chat: MessageSquare,
  drive: Folder,
  contacts: Users,
  finance: Wallet,
  forms: FileText,
  learn: BookOpen,
  teach: GraduationCap,
  hive: Network,
  mind: BrainCircuit,
  git: Code2,
  ai: Sparkles,
  track: Timer,
  cms: FileText,
  inventory: Boxes,
  storefront: ShoppingBag,
  pay: Wallet,
  tools: Wrench,
  shortener: Link,
  colab: Users,
  infrastructure: Server,
};

import Image from 'next/image';

const assets: Record<string, string> = {
  platform: 'tuturuuu',
  tuturuuu: 'tuturuuu',
  mira: 'mira',
  nova: 'nova',
  rewise: 'rewise',
  tudo: 'tudo',
  tasks: 'tudo',
};

/** Approved brand assets; other products retain the platform's app icon. */
export function ProductMark({
  product,
  size = 28,
}: {
  product: string;
  size?: number;
}) {
  const slug = product.toLowerCase();
  const asset = assets[slug];
  const Icon = appIcons[slug] ?? LayoutGrid;
  return asset ? (
    <Image
      src={`/media/branding/${asset}.svg`}
      width={size}
      height={size}
      alt=""
      style={{ objectFit: 'contain', flexShrink: 0 }}
    />
  ) : (
    <Icon size={size} aria-hidden="true" />
  );
}

export function DiagramMark({
  product,
  x,
  y,
  size = 28,
}: {
  product: string;
  x: number;
  y: number;
  size?: number;
}) {
  const slug = product.toLowerCase();
  const asset = assets[slug];
  const Icon = appIcons[slug] ?? LayoutGrid;
  return asset ? (
    <image
      href={`/media/branding/${asset}.svg`}
      x={x}
      y={y}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
    />
  ) : (
    <Icon
      x={x}
      y={y}
      width={size}
      height={size}
      stroke="currentColor"
      strokeWidth={1.7}
      fill="none"
    />
  );
}
