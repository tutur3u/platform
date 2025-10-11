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
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useState } from 'react';
import { Button } from '../button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../tooltip';

export default function IconPicker() {
  const [open, setOpen] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<React.ReactNode>(<Users />);
  const [selectedLabel, setSelectedLabel] = useState<string>('Users');

  const icons: { label: string; Icon: LucideIcon }[] = [
    { label: 'Users', Icon: Users },
    { label: 'User', Icon: User },
    { label: 'Calendar', Icon: Calendar },
    { label: 'Calendar Days', Icon: CalendarDays },
    { label: 'Calendar Check', Icon: CalendarCheck },
    { label: 'Clock', Icon: Clock },
    { label: 'Alarm Clock', Icon: AlarmClock },
    { label: 'Bell', Icon: Bell },
    { label: 'Briefcase', Icon: Briefcase },
    { label: 'Clipboard List', Icon: ClipboardList },
    { label: 'Check Square', Icon: CheckSquare },
    { label: 'Trending Up', Icon: TrendingUp },
    { label: 'Star', Icon: Star },
    { label: 'Settings', Icon: Settings },
    { label: 'Shield', Icon: Shield },
    { label: 'Shopping Cart', Icon: ShoppingCart },
    { label: 'Credit Card', Icon: CreditCard },
    { label: 'Wallet', Icon: Wallet },
    { label: 'Tag', Icon: Tag },
    { label: 'Target', Icon: Target },
    { label: 'Thumbs Up', Icon: ThumbsUp },
    { label: 'Trophy', Icon: Trophy },
    { label: 'Rocket', Icon: Rocket },
    { label: 'Gift', Icon: Gift },
    { label: 'Globe', Icon: Globe },
    { label: 'Map Pin', Icon: MapPin },
    { label: 'Home', Icon: Home },
    { label: 'Building', Icon: Building2 },
    { label: 'Folder', Icon: Folder },
    { label: 'Folder Open', Icon: FolderOpen },
    { label: 'File Text', Icon: FileText },
    { label: 'Database', Icon: Database },
    { label: 'Server', Icon: Server },
    { label: 'Inbox', Icon: Inbox },
    { label: 'Mail', Icon: Mail },
    { label: 'Message', Icon: MessageSquare },
    { label: 'Phone', Icon: Phone },
    { label: 'Video', Icon: Video },
    { label: 'Mic', Icon: Mic },
    { label: 'Image', Icon: Image },
    { label: 'Paperclip', Icon: Paperclip },
    { label: 'Link', Icon: Link },
    { label: 'External Link', Icon: ExternalLink },
    { label: 'Download', Icon: Download },
    { label: 'Upload', Icon: Upload },
    { label: 'Search', Icon: Search },
    { label: 'Eye', Icon: Eye },
    { label: 'Eye Off', Icon: EyeOff },
    { label: 'Lock', Icon: Lock },
    { label: 'Key', Icon: Key },
    { label: 'Wrench', Icon: Wrench },
    { label: 'Paintbrush', Icon: Paintbrush },
    { label: 'Wand', Icon: Wand2 },
    { label: 'Lightbulb', Icon: Lightbulb },
    { label: 'Bug', Icon: Bug },
    { label: 'Graduation Cap', Icon: GraduationCap },
    { label: 'Book Open', Icon: BookOpen },
    { label: 'Bookmark', Icon: Bookmark },
    { label: 'Newspaper', Icon: Newspaper },
    { label: 'List Checks', Icon: ListChecks },
    { label: 'Pie Chart', Icon: PieChart },
    { label: 'Play', Icon: Play },
    { label: 'Plus Square', Icon: PlusSquare },
    { label: 'Puzzle', Icon: Puzzle },
    { label: 'Package', Icon: Package },
    { label: 'Truck', Icon: Truck },
    { label: 'Monitor', Icon: Monitor },
    { label: 'Laptop', Icon: Laptop },
    { label: 'Music', Icon: Music },
    { label: 'Timer', Icon: Timer },
    { label: 'Trash', Icon: Trash2 },
    { label: 'Heart', Icon: Heart },
    { label: 'Help', Icon: HelpCircle },
    { label: 'Moon', Icon: Moon },
    { label: 'Zap', Icon: Zap },
    { label: 'Flame', Icon: Flame },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={selectedLabel}>
          {selectedIcon}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Select an Icon</DialogTitle>
        <TooltipProvider>
          <div className="grid h-full max-h-64 grid-cols-6 gap-2 overflow-y-auto">
            {icons.map(({ label, Icon }) => {
              const isSelected = label === selectedLabel;
              return (
                <Tooltip key={label}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isSelected ? undefined : 'outline'}
                      size="xs"
                      aria-label={label}
                      onClick={() => {
                        setSelectedIcon(<Icon className="h-4 w-4" />);
                        setSelectedLabel(label);
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
      </DialogContent>
    </Dialog>
  );
}
