'use client';

import type { LucideIcon } from '@tuturuuu/icons';
import {
  AlarmClock,
  Bell,
  Bookmark,
  BookOpen,
  Briefcase,
  Bug,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  Circle,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Folder,
  FolderOpen,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  HelpCircle,
  Home,
  Image,
  Inbox,
  Key,
  Laptop,
  Lightbulb,
  Link,
  ListChecks,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Mic,
  Monitor,
  Moon,
  Music,
  Newspaper,
  Package,
  Paintbrush,
  Paperclip,
  Phone,
  PieChart,
  Play,
  PlusSquare,
  Puzzle,
  Rocket,
  Search,
  Server,
  Settings,
  Shield,
  ShoppingCart,
  Star,
  Tag,
  Target,
  ThumbsUp,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Truck,
  Upload,
  User,
  Users,
  Video,
  Wallet,
  Wand2,
  Wrench,
  Zap,
} from '@tuturuuu/icons';
import type { Database as SupabaseDatabase } from '@tuturuuu/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useMemo, useState } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import { ScrollArea } from '../scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../tooltip';

type IconOption = {
  value: WorkspaceBoardIconKey;
  label: string;
  Icon: LucideIcon;
};

type DbWorkspaceBoardIcon =
  SupabaseDatabase['public']['Enums']['workspace_board_icon'];

export const WORKSPACE_BOARD_ICON_VALUES = [
  'Users',
  'User',
  'Briefcase',
  'Target',
  'Rocket',
  'TrendingUp',
  'ClipboardList',
  'ListChecks',
  'CheckSquare',
  'Calendar',
  'CalendarDays',
  'CalendarCheck',
  'Clock',
  'AlarmClock',
  'Bell',
  'Star',
  'Settings',
  'Shield',
  'Tag',
  'Folder',
  'FolderOpen',
  'FileText',
  'Database',
  'Server',
  'Inbox',
  'Mail',
  'MessageSquare',
  'Phone',
  'Video',
  'Mic',
  'Image',
  'Paperclip',
  'Link',
  'ExternalLink',
  'Download',
  'Upload',
  'Search',
  'Eye',
  'EyeOff',
  'Lock',
  'Key',
  'Wrench',
  'Paintbrush',
  'Wand2',
  'Lightbulb',
  'Bug',
  'GraduationCap',
  'BookOpen',
  'Bookmark',
  'Newspaper',
  'PieChart',
  'Play',
  'PlusSquare',
  'Puzzle',
  'Package',
  'Truck',
  'Monitor',
  'Laptop',
  'Music',
  'Timer',
  'Trash2',
  'Heart',
  'HelpCircle',
  'Moon',
  'Zap',
  'Flame',
  'Gift',
  'Globe',
  'MapPin',
  'Home',
  'Building2',
  'ShoppingCart',
  'CreditCard',
  'Wallet',
  'ThumbsUp',
  'Trophy',
] as const satisfies readonly DbWorkspaceBoardIcon[];

export type WorkspaceBoardIconKey =
  (typeof WORKSPACE_BOARD_ICON_VALUES)[number];

// Ensure UI list covers the DB enum (compile-time).
type _IconValuesCoverDb =
  Exclude<DbWorkspaceBoardIcon, WorkspaceBoardIconKey> extends never
    ? true
    : never;
// Compile-time only assertion (exported to avoid TS "unused" warnings).
export type AssertWorkspaceBoardIconValuesCoverDb = _IconValuesCoverDb;

export const ICON_OPTIONS: IconOption[] = [
  { value: 'Users', label: 'Users', Icon: Users },
  { value: 'User', label: 'User', Icon: User },
  { value: 'Briefcase', label: 'Briefcase', Icon: Briefcase },
  { value: 'Target', label: 'Target', Icon: Target },
  { value: 'Rocket', label: 'Rocket', Icon: Rocket },
  { value: 'TrendingUp', label: 'Trending Up', Icon: TrendingUp },
  { value: 'ClipboardList', label: 'Clipboard List', Icon: ClipboardList },
  { value: 'ListChecks', label: 'List Checks', Icon: ListChecks },
  { value: 'CheckSquare', label: 'Check Square', Icon: CheckSquare },
  { value: 'Calendar', label: 'Calendar', Icon: Calendar },
  { value: 'CalendarDays', label: 'Calendar Days', Icon: CalendarDays },
  { value: 'CalendarCheck', label: 'Calendar Check', Icon: CalendarCheck },
  { value: 'Clock', label: 'Clock', Icon: Clock },
  { value: 'AlarmClock', label: 'Alarm Clock', Icon: AlarmClock },
  { value: 'Bell', label: 'Bell', Icon: Bell },
  { value: 'Star', label: 'Star', Icon: Star },
  { value: 'Settings', label: 'Settings', Icon: Settings },
  { value: 'Shield', label: 'Shield', Icon: Shield },
  { value: 'Tag', label: 'Tag', Icon: Tag },
  { value: 'Folder', label: 'Folder', Icon: Folder },
  { value: 'FolderOpen', label: 'Folder Open', Icon: FolderOpen },
  { value: 'FileText', label: 'File Text', Icon: FileText },
  { value: 'Database', label: 'Database', Icon: Database },
  { value: 'Server', label: 'Server', Icon: Server },
  { value: 'Inbox', label: 'Inbox', Icon: Inbox },
  { value: 'Mail', label: 'Mail', Icon: Mail },
  { value: 'MessageSquare', label: 'Message', Icon: MessageSquare },
  { value: 'Phone', label: 'Phone', Icon: Phone },
  { value: 'Video', label: 'Video', Icon: Video },
  { value: 'Mic', label: 'Mic', Icon: Mic },
  { value: 'Image', label: 'Image', Icon: Image },
  { value: 'Paperclip', label: 'Paperclip', Icon: Paperclip },
  { value: 'Link', label: 'Link', Icon: Link },
  { value: 'ExternalLink', label: 'External Link', Icon: ExternalLink },
  { value: 'Download', label: 'Download', Icon: Download },
  { value: 'Upload', label: 'Upload', Icon: Upload },
  { value: 'Search', label: 'Search', Icon: Search },
  { value: 'Eye', label: 'Eye', Icon: Eye },
  { value: 'EyeOff', label: 'Eye Off', Icon: EyeOff },
  { value: 'Lock', label: 'Lock', Icon: Lock },
  { value: 'Key', label: 'Key', Icon: Key },
  { value: 'Wrench', label: 'Wrench', Icon: Wrench },
  { value: 'Paintbrush', label: 'Paintbrush', Icon: Paintbrush },
  { value: 'Wand2', label: 'Wand', Icon: Wand2 },
  { value: 'Lightbulb', label: 'Lightbulb', Icon: Lightbulb },
  { value: 'Bug', label: 'Bug', Icon: Bug },
  { value: 'GraduationCap', label: 'Graduation Cap', Icon: GraduationCap },
  { value: 'BookOpen', label: 'Book Open', Icon: BookOpen },
  { value: 'Bookmark', label: 'Bookmark', Icon: Bookmark },
  { value: 'Newspaper', label: 'Newspaper', Icon: Newspaper },
  { value: 'PieChart', label: 'Pie Chart', Icon: PieChart },
  { value: 'Play', label: 'Play', Icon: Play },
  { value: 'PlusSquare', label: 'Plus Square', Icon: PlusSquare },
  { value: 'Puzzle', label: 'Puzzle', Icon: Puzzle },
  { value: 'Package', label: 'Package', Icon: Package },
  { value: 'Truck', label: 'Truck', Icon: Truck },
  { value: 'Monitor', label: 'Monitor', Icon: Monitor },
  { value: 'Laptop', label: 'Laptop', Icon: Laptop },
  { value: 'Music', label: 'Music', Icon: Music },
  { value: 'Timer', label: 'Timer', Icon: Timer },
  { value: 'Trash2', label: 'Trash', Icon: Trash2 },
  { value: 'Heart', label: 'Heart', Icon: Heart },
  { value: 'HelpCircle', label: 'Help', Icon: HelpCircle },
  { value: 'Moon', label: 'Moon', Icon: Moon },
  { value: 'Zap', label: 'Zap', Icon: Zap },
  { value: 'Flame', label: 'Flame', Icon: Flame },
  { value: 'Gift', label: 'Gift', Icon: Gift },
  { value: 'Globe', label: 'Globe', Icon: Globe },
  { value: 'MapPin', label: 'Map Pin', Icon: MapPin },
  { value: 'Home', label: 'Home', Icon: Home },
  { value: 'Building2', label: 'Building', Icon: Building2 },
  { value: 'ShoppingCart', label: 'Shopping Cart', Icon: ShoppingCart },
  { value: 'CreditCard', label: 'Credit Card', Icon: CreditCard },
  { value: 'Wallet', label: 'Wallet', Icon: Wallet },
  { value: 'ThumbsUp', label: 'Thumbs Up', Icon: ThumbsUp },
  { value: 'Trophy', label: 'Trophy', Icon: Trophy },
];

export function getIconComponentByKey(
  value: WorkspaceBoardIconKey | null | undefined
) {
  if (!value) return undefined;
  return ICON_OPTIONS.find((o) => o.value === value)?.Icon;
}

export interface IconPickerProps {
  value?: WorkspaceBoardIconKey | null;
  onValueChange: (value: WorkspaceBoardIconKey | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
  ariaLabel?: string;
  title?: string;
  description?: string;
  searchPlaceholder?: string;
  clearLabel?: string;
}

export default function IconPicker({
  value,
  onValueChange,
  disabled,
  allowClear = true,
  ariaLabel = 'Select icon',
  title = 'Select an icon',
  description = 'Choose an icon to represent this item.',
  searchPlaceholder = 'Search icons...',
  clearLabel = 'Clear',
}: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedOption = useMemo(
    () => ICON_OPTIONS.find((o) => o.value === value) ?? null,
    [value]
  );
  const SelectedIcon = selectedOption?.Icon ?? Circle;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICON_OPTIONS;
    return ICON_OPTIONS.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className="h-10 w-10 p-0"
        >
          <SelectedIcon className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
          />
          {allowClear && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onValueChange(null);
                setOpen(false);
              }}
            >
              {clearLabel}
            </Button>
          )}
        </div>

        <ScrollArea className="h-72 pr-2">
          <TooltipProvider>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {filtered.map(({ value: v, label, Icon }) => {
                const isSelected = v === value;
                return (
                  <Tooltip key={v}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        size="icon"
                        aria-label={label}
                        onClick={() => {
                          onValueChange(v);
                          setOpen(false);
                        }}
                      >
                        <Icon className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{label}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
