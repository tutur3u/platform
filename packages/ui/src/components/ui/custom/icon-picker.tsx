'use client';

import type { LucideIcon } from '@tuturuuu/icons';
import {
  Activity,
  // Original icons
  AlarmClock,
  // New icons - Alerts & Status
  AlertCircle,
  AlertTriangle,
  Anchor,
  Apple,
  Archive,
  // New icons - Home & Lifestyle
  Armchair,
  ArrowDown,
  ArrowLeft,
  // New icons - Arrows & Actions
  ArrowRight,
  ArrowUp,
  Atom,
  AtSign,
  // New icons - Miscellaneous
  Award,
  Axe,
  BadgeCheck,
  Banknote,
  BarChart,
  BarChart2,
  Barcode,
  Bath,
  Battery,
  Bed,
  Beer,
  Bell,
  BellOff,
  BellRing,
  Bike,
  Blocks,
  Bluetooth,
  // New icons - Education & Learning
  Book,
  Bookmark,
  BookOpen,
  Bot,
  Brain,
  BrainCircuit,
  Briefcase,
  Brush,
  Bug,
  Building2,
  Bus,
  Cake,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Camera,
  Car,
  CheckSquare,
  Circle,
  CircleAlert,
  CircleCheck,
  // New icons - Shapes & Symbols
  CircleDot,
  CircleX,
  Clapperboard,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Cloud,
  CloudRain,
  // New icons - Tools & Development
  Code,
  Code2,
  Coffee,
  Coins,
  Compass,
  Contact,
  Cookie,
  Cpu,
  CreditCard,
  Crown,
  Database,
  Diamond,
  Dice1,
  Dna,
  // New icons - Business & Finance
  DollarSign,
  Download,
  Drama,
  Dumbbell,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  // New icons - Files & Documents
  File,
  FileAudio,
  FileCheck,
  FileCode,
  FileImage,
  FilePlus,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Film,
  Fingerprint,
  Flag,
  Flame,
  // New icons - Science & Research
  FlaskConical,
  Flower2,
  Folder,
  FolderCheck,
  FolderOpen,
  FolderPlus,
  Footprints,
  // New icons - Entertainment & Gaming
  Gamepad2,
  Gem,
  Gift,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Glasses,
  Globe,
  GraduationCap,
  Hammer,
  Handshake,
  HardDrive,
  Hash,
  Headphones,
  Heart,
  // New icons - Health & Fitness
  HeartPulse,
  HelpCircle,
  Hexagon,
  Highlighter,
  Home,
  Hotel,
  IceCream2,
  Image,
  Inbox,
  InfinityIcon,
  Info,
  Key,
  Keyboard,
  KeyRound,
  Lamp,
  Languages,
  Laptop,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LayoutList,
  Leaf,
  Library,
  Lightbulb,
  LineChart,
  Link,
  ListChecks,
  Locate,
  Lock,
  LockKeyhole,
  Luggage,
  Magnet,
  Mail,
  // New icons - Location & Navigation
  MapIcon,
  MapPin,
  Maximize2,
  Medal,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Mic,
  Microscope,
  Milestone,
  Minimize2,
  Monitor,
  Moon,
  Mountain,
  Mouse,
  Move,
  Music,
  Navigation,
  Newspaper,
  Octagon,
  Orbit,
  Package,
  Paintbrush,
  Palette,
  Paperclip,
  PartyPopper,
  PenTool,
  Pentagon,
  Phone,
  PieChart,
  PiggyBank,
  Pill,
  Pin,
  Pipette,
  Pizza,
  // New icons - Travel & Transportation
  Plane,
  Play,
  Plug,
  PlusSquare,
  Popcorn,
  Power,
  Presentation,
  Printer,
  Puzzle,
  QrCode,
  Radio,
  Rainbow,
  Receipt,
  RefreshCw,
  Repeat,
  Rocket,
  RotateCcw,
  Route,
  Rss,
  Ruler,
  Salad,
  Satellite,
  Scan,
  ScanFace,
  School,
  Scissors,
  Search,
  // New icons - Communication
  Send,
  Server,
  Settings,
  Shapes,
  Share,
  Share2,
  Shield,
  ShieldAlert,
  // New icons - Security & Privacy
  ShieldCheck,
  Ship,
  Shirt,
  ShoppingCart,
  Shuffle,
  Signpost,
  // New icons - Technology & Devices
  Smartphone,
  Snowflake,
  Sofa,
  Sparkle,
  Sparkles,
  Speaker,
  Square,
  Star,
  Stethoscope,
  // New icons - Weather & Nature
  Sun,
  Syringe,
  Tablet,
  Tag,
  Target,
  Telescope,
  Terminal,
  Thermometer,
  ThumbsUp,
  Ticket,
  Timer,
  Train,
  Trash2,
  Trees,
  TrendingDown,
  TrendingUp,
  Triangle,
  Trophy,
  Truck,
  Tv,
  Tv2,
  Umbrella,
  UnlockKeyhole,
  Upload,
  User,
  UserCheck,
  UserMinus,
  // New icons - People & Social
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  UserX,
  // New icons - Food & Dining
  UtensilsCrossed,
  Video,
  Wallet,
  Wand2,
  Watch,
  Wifi,
  Wind,
  Wine,
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
  // Original icons
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
  // New icons - Technology & Devices
  'Smartphone',
  'Tablet',
  'Cpu',
  'HardDrive',
  'Wifi',
  'Bluetooth',
  'Camera',
  'Headphones',
  'Speaker',
  'Tv',
  'Printer',
  'Keyboard',
  'Mouse',
  // New icons - Business & Finance
  'DollarSign',
  'Banknote',
  'Receipt',
  'Calculator',
  'TrendingDown',
  'BarChart',
  'BarChart2',
  'LineChart',
  'Activity',
  'Coins',
  'PiggyBank',
  // New icons - Communication
  'Send',
  'AtSign',
  'Hash',
  'MessageCircle',
  'MessagesSquare',
  'Share',
  'Share2',
  'Megaphone',
  'Radio',
  'Rss',
  // New icons - Files & Documents
  'File',
  'FileCode',
  'FileImage',
  'FileAudio',
  'FileVideo',
  'FileSpreadsheet',
  'FileCheck',
  'FilePlus',
  'FolderPlus',
  'FolderCheck',
  'Archive',
  'ClipboardCheck',
  // New icons - People & Social
  'UserPlus',
  'UserCheck',
  'UserX',
  'UserMinus',
  'UsersRound',
  'UserRound',
  'Crown',
  'Contact',
  'Handshake',
  // New icons - Location & Navigation
  'Map',
  'Navigation',
  'Compass',
  'Locate',
  'Milestone',
  'Signpost',
  'Route',
  // New icons - Weather & Nature
  'Sun',
  'Cloud',
  'CloudRain',
  'Snowflake',
  'Wind',
  'Thermometer',
  'Umbrella',
  'Rainbow',
  'Leaf',
  'Trees',
  'Flower2',
  'Mountain',
  // New icons - Health & Fitness
  'HeartPulse',
  'Stethoscope',
  'Pill',
  'Syringe',
  'Dumbbell',
  'Bike',
  'Footprints',
  'Brain',
  'Salad',
  // New icons - Food & Dining
  'UtensilsCrossed',
  'Coffee',
  'Wine',
  'Beer',
  'Pizza',
  'Cake',
  'Cookie',
  'IceCream2',
  'Apple',
  // New icons - Travel & Transportation
  'Plane',
  'Car',
  'Bus',
  'Train',
  'Ship',
  'Anchor',
  'Luggage',
  'Ticket',
  'Hotel',
  // New icons - Entertainment & Gaming
  'Gamepad2',
  'Dice1',
  'Clapperboard',
  'Popcorn',
  'Drama',
  'PartyPopper',
  'Sparkles',
  'Film',
  'Tv2',
  // New icons - Education & Learning
  'Book',
  'Library',
  'PenTool',
  'Highlighter',
  'Ruler',
  'School',
  'Presentation',
  'Languages',
  // New icons - Science & Research
  'FlaskConical',
  'Microscope',
  'Atom',
  'Dna',
  'Telescope',
  'Orbit',
  'Satellite',
  // New icons - Tools & Development
  'Code',
  'Code2',
  'Terminal',
  'GitBranch',
  'GitMerge',
  'GitPullRequest',
  'Hammer',
  'Axe',
  'Scissors',
  'Brush',
  'Palette',
  'Pipette',
  'Eraser',
  // New icons - Shapes & Symbols
  'CircleDot',
  'Square',
  'Triangle',
  'Pentagon',
  'Hexagon',
  'Octagon',
  'Diamond',
  'Shapes',
  // New icons - Security & Privacy
  'ShieldCheck',
  'ShieldAlert',
  'Fingerprint',
  'ScanFace',
  'KeyRound',
  'LockKeyhole',
  'UnlockKeyhole',
  // New icons - Home & Lifestyle
  'Armchair',
  'Bed',
  'Bath',
  'Lamp',
  'Sofa',
  'Shirt',
  'Watch',
  'Glasses',
  'Gem',
  // New icons - Miscellaneous
  'Award',
  'Medal',
  'BadgeCheck',
  'Flag',
  'Pin',
  'Magnet',
  'Battery',
  'Power',
  'Plug',
  'Infinity',
  'QrCode',
  'Barcode',
  'Scan',
  'Bot',
  'BrainCircuit',
  'Sparkle',
  'Blocks',
  'Layers',
  'LayoutGrid',
  'LayoutList',
  'LayoutDashboard',
  // New icons - Arrows & Actions
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'RefreshCw',
  'RotateCcw',
  'Repeat',
  'Shuffle',
  'Move',
  'Maximize2',
  'Minimize2',
  // New icons - Alerts & Status
  'AlertCircle',
  'AlertTriangle',
  'Info',
  'CircleCheck',
  'CircleX',
  'CircleAlert',
  'BellRing',
  'BellOff',
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
  // Original icons
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
  // New icons - Technology & Devices
  { value: 'Smartphone', label: 'Smartphone', Icon: Smartphone },
  { value: 'Tablet', label: 'Tablet', Icon: Tablet },
  { value: 'Cpu', label: 'CPU', Icon: Cpu },
  { value: 'HardDrive', label: 'Hard Drive', Icon: HardDrive },
  { value: 'Wifi', label: 'WiFi', Icon: Wifi },
  { value: 'Bluetooth', label: 'Bluetooth', Icon: Bluetooth },
  { value: 'Camera', label: 'Camera', Icon: Camera },
  { value: 'Headphones', label: 'Headphones', Icon: Headphones },
  { value: 'Speaker', label: 'Speaker', Icon: Speaker },
  { value: 'Tv', label: 'TV', Icon: Tv },
  { value: 'Printer', label: 'Printer', Icon: Printer },
  { value: 'Keyboard', label: 'Keyboard', Icon: Keyboard },
  { value: 'Mouse', label: 'Mouse', Icon: Mouse },
  // New icons - Business & Finance
  { value: 'DollarSign', label: 'Dollar Sign', Icon: DollarSign },
  { value: 'Banknote', label: 'Banknote', Icon: Banknote },
  { value: 'Receipt', label: 'Receipt', Icon: Receipt },
  { value: 'Calculator', label: 'Calculator', Icon: Calculator },
  { value: 'TrendingDown', label: 'Trending Down', Icon: TrendingDown },
  { value: 'BarChart', label: 'Bar Chart', Icon: BarChart },
  { value: 'BarChart2', label: 'Bar Chart 2', Icon: BarChart2 },
  { value: 'LineChart', label: 'Line Chart', Icon: LineChart },
  { value: 'Activity', label: 'Activity', Icon: Activity },
  { value: 'Coins', label: 'Coins', Icon: Coins },
  { value: 'PiggyBank', label: 'Piggy Bank', Icon: PiggyBank },
  // New icons - Communication
  { value: 'Send', label: 'Send', Icon: Send },
  { value: 'AtSign', label: 'At Sign', Icon: AtSign },
  { value: 'Hash', label: 'Hash', Icon: Hash },
  { value: 'MessageCircle', label: 'Message Circle', Icon: MessageCircle },
  { value: 'MessagesSquare', label: 'Messages', Icon: MessagesSquare },
  { value: 'Share', label: 'Share', Icon: Share },
  { value: 'Share2', label: 'Share 2', Icon: Share2 },
  { value: 'Megaphone', label: 'Megaphone', Icon: Megaphone },
  { value: 'Radio', label: 'Radio', Icon: Radio },
  { value: 'Rss', label: 'RSS', Icon: Rss },
  // New icons - Files & Documents
  { value: 'File', label: 'File', Icon: File },
  { value: 'FileCode', label: 'File Code', Icon: FileCode },
  { value: 'FileImage', label: 'File Image', Icon: FileImage },
  { value: 'FileAudio', label: 'File Audio', Icon: FileAudio },
  { value: 'FileVideo', label: 'File Video', Icon: FileVideo },
  { value: 'FileSpreadsheet', label: 'Spreadsheet', Icon: FileSpreadsheet },
  { value: 'FileCheck', label: 'File Check', Icon: FileCheck },
  { value: 'FilePlus', label: 'File Plus', Icon: FilePlus },
  { value: 'FolderPlus', label: 'Folder Plus', Icon: FolderPlus },
  { value: 'FolderCheck', label: 'Folder Check', Icon: FolderCheck },
  { value: 'Archive', label: 'Archive', Icon: Archive },
  { value: 'ClipboardCheck', label: 'Clipboard Check', Icon: ClipboardCheck },
  // New icons - People & Social
  { value: 'UserPlus', label: 'User Plus', Icon: UserPlus },
  { value: 'UserCheck', label: 'User Check', Icon: UserCheck },
  { value: 'UserX', label: 'User X', Icon: UserX },
  { value: 'UserMinus', label: 'User Minus', Icon: UserMinus },
  { value: 'UsersRound', label: 'Users Round', Icon: UsersRound },
  { value: 'UserRound', label: 'User Round', Icon: UserRound },
  { value: 'Crown', label: 'Crown', Icon: Crown },
  { value: 'Contact', label: 'Contact', Icon: Contact },
  { value: 'Handshake', label: 'Handshake', Icon: Handshake },
  // New icons - Location & Navigation
  { value: 'Map', label: 'Map', Icon: MapIcon },
  { value: 'Navigation', label: 'Navigation', Icon: Navigation },
  { value: 'Compass', label: 'Compass', Icon: Compass },
  { value: 'Locate', label: 'Locate', Icon: Locate },
  { value: 'Milestone', label: 'Milestone', Icon: Milestone },
  { value: 'Signpost', label: 'Signpost', Icon: Signpost },
  { value: 'Route', label: 'Route', Icon: Route },
  // New icons - Weather & Nature
  { value: 'Sun', label: 'Sun', Icon: Sun },
  { value: 'Cloud', label: 'Cloud', Icon: Cloud },
  { value: 'CloudRain', label: 'Cloud Rain', Icon: CloudRain },
  { value: 'Snowflake', label: 'Snowflake', Icon: Snowflake },
  { value: 'Wind', label: 'Wind', Icon: Wind },
  { value: 'Thermometer', label: 'Thermometer', Icon: Thermometer },
  { value: 'Umbrella', label: 'Umbrella', Icon: Umbrella },
  { value: 'Rainbow', label: 'Rainbow', Icon: Rainbow },
  { value: 'Leaf', label: 'Leaf', Icon: Leaf },
  { value: 'Trees', label: 'Trees', Icon: Trees },
  { value: 'Flower2', label: 'Flower', Icon: Flower2 },
  { value: 'Mountain', label: 'Mountain', Icon: Mountain },
  // New icons - Health & Fitness
  { value: 'HeartPulse', label: 'Heart Pulse', Icon: HeartPulse },
  { value: 'Stethoscope', label: 'Stethoscope', Icon: Stethoscope },
  { value: 'Pill', label: 'Pill', Icon: Pill },
  { value: 'Syringe', label: 'Syringe', Icon: Syringe },
  { value: 'Dumbbell', label: 'Dumbbell', Icon: Dumbbell },
  { value: 'Bike', label: 'Bike', Icon: Bike },
  { value: 'Footprints', label: 'Footprints', Icon: Footprints },
  { value: 'Brain', label: 'Brain', Icon: Brain },
  { value: 'Salad', label: 'Salad', Icon: Salad },
  // New icons - Food & Dining
  { value: 'UtensilsCrossed', label: 'Utensils', Icon: UtensilsCrossed },
  { value: 'Coffee', label: 'Coffee', Icon: Coffee },
  { value: 'Wine', label: 'Wine', Icon: Wine },
  { value: 'Beer', label: 'Beer', Icon: Beer },
  { value: 'Pizza', label: 'Pizza', Icon: Pizza },
  { value: 'Cake', label: 'Cake', Icon: Cake },
  { value: 'Cookie', label: 'Cookie', Icon: Cookie },
  { value: 'IceCream2', label: 'Ice Cream', Icon: IceCream2 },
  { value: 'Apple', label: 'Apple', Icon: Apple },
  // New icons - Travel & Transportation
  { value: 'Plane', label: 'Plane', Icon: Plane },
  { value: 'Car', label: 'Car', Icon: Car },
  { value: 'Bus', label: 'Bus', Icon: Bus },
  { value: 'Train', label: 'Train', Icon: Train },
  { value: 'Ship', label: 'Ship', Icon: Ship },
  { value: 'Anchor', label: 'Anchor', Icon: Anchor },
  { value: 'Luggage', label: 'Luggage', Icon: Luggage },
  { value: 'Ticket', label: 'Ticket', Icon: Ticket },
  { value: 'Hotel', label: 'Hotel', Icon: Hotel },
  // New icons - Entertainment & Gaming
  { value: 'Gamepad2', label: 'Gamepad', Icon: Gamepad2 },
  { value: 'Dice1', label: 'Dice', Icon: Dice1 },
  { value: 'Clapperboard', label: 'Clapperboard', Icon: Clapperboard },
  { value: 'Popcorn', label: 'Popcorn', Icon: Popcorn },
  { value: 'Drama', label: 'Drama', Icon: Drama },
  { value: 'PartyPopper', label: 'Party', Icon: PartyPopper },
  { value: 'Sparkles', label: 'Sparkles', Icon: Sparkles },
  { value: 'Film', label: 'Film', Icon: Film },
  { value: 'Tv2', label: 'TV 2', Icon: Tv2 },
  // New icons - Education & Learning
  { value: 'Book', label: 'Book', Icon: Book },
  { value: 'Library', label: 'Library', Icon: Library },
  { value: 'PenTool', label: 'Pen Tool', Icon: PenTool },
  { value: 'Highlighter', label: 'Highlighter', Icon: Highlighter },
  { value: 'Ruler', label: 'Ruler', Icon: Ruler },
  { value: 'School', label: 'School', Icon: School },
  { value: 'Presentation', label: 'Presentation', Icon: Presentation },
  { value: 'Languages', label: 'Languages', Icon: Languages },
  // New icons - Science & Research
  { value: 'FlaskConical', label: 'Flask', Icon: FlaskConical },
  { value: 'Microscope', label: 'Microscope', Icon: Microscope },
  { value: 'Atom', label: 'Atom', Icon: Atom },
  { value: 'Dna', label: 'DNA', Icon: Dna },
  { value: 'Telescope', label: 'Telescope', Icon: Telescope },
  { value: 'Orbit', label: 'Orbit', Icon: Orbit },
  { value: 'Satellite', label: 'Satellite', Icon: Satellite },
  // New icons - Tools & Development
  { value: 'Code', label: 'Code', Icon: Code },
  { value: 'Code2', label: 'Code 2', Icon: Code2 },
  { value: 'Terminal', label: 'Terminal', Icon: Terminal },
  { value: 'GitBranch', label: 'Git Branch', Icon: GitBranch },
  { value: 'GitMerge', label: 'Git Merge', Icon: GitMerge },
  { value: 'GitPullRequest', label: 'Pull Request', Icon: GitPullRequest },
  { value: 'Hammer', label: 'Hammer', Icon: Hammer },
  { value: 'Axe', label: 'Axe', Icon: Axe },
  { value: 'Scissors', label: 'Scissors', Icon: Scissors },
  { value: 'Brush', label: 'Brush', Icon: Brush },
  { value: 'Palette', label: 'Palette', Icon: Palette },
  { value: 'Pipette', label: 'Pipette', Icon: Pipette },
  { value: 'Eraser', label: 'Eraser', Icon: Eraser },
  // New icons - Shapes & Symbols
  { value: 'CircleDot', label: 'Circle Dot', Icon: CircleDot },
  { value: 'Square', label: 'Square', Icon: Square },
  { value: 'Triangle', label: 'Triangle', Icon: Triangle },
  { value: 'Pentagon', label: 'Pentagon', Icon: Pentagon },
  { value: 'Hexagon', label: 'Hexagon', Icon: Hexagon },
  { value: 'Octagon', label: 'Octagon', Icon: Octagon },
  { value: 'Diamond', label: 'Diamond', Icon: Diamond },
  { value: 'Shapes', label: 'Shapes', Icon: Shapes },
  // New icons - Security & Privacy
  { value: 'ShieldCheck', label: 'Shield Check', Icon: ShieldCheck },
  { value: 'ShieldAlert', label: 'Shield Alert', Icon: ShieldAlert },
  { value: 'Fingerprint', label: 'Fingerprint', Icon: Fingerprint },
  { value: 'ScanFace', label: 'Face ID', Icon: ScanFace },
  { value: 'KeyRound', label: 'Key Round', Icon: KeyRound },
  { value: 'LockKeyhole', label: 'Lock Keyhole', Icon: LockKeyhole },
  { value: 'UnlockKeyhole', label: 'Unlock', Icon: UnlockKeyhole },
  // New icons - Home & Lifestyle
  { value: 'Armchair', label: 'Armchair', Icon: Armchair },
  { value: 'Bed', label: 'Bed', Icon: Bed },
  { value: 'Bath', label: 'Bath', Icon: Bath },
  { value: 'Lamp', label: 'Lamp', Icon: Lamp },
  { value: 'Sofa', label: 'Sofa', Icon: Sofa },
  { value: 'Shirt', label: 'Shirt', Icon: Shirt },
  { value: 'Watch', label: 'Watch', Icon: Watch },
  { value: 'Glasses', label: 'Glasses', Icon: Glasses },
  { value: 'Gem', label: 'Gem', Icon: Gem },
  // New icons - Miscellaneous
  { value: 'Award', label: 'Award', Icon: Award },
  { value: 'Medal', label: 'Medal', Icon: Medal },
  { value: 'BadgeCheck', label: 'Badge Check', Icon: BadgeCheck },
  { value: 'Flag', label: 'Flag', Icon: Flag },
  { value: 'Pin', label: 'Pin', Icon: Pin },
  { value: 'Magnet', label: 'Magnet', Icon: Magnet },
  { value: 'Battery', label: 'Battery', Icon: Battery },
  { value: 'Power', label: 'Power', Icon: Power },
  { value: 'Plug', label: 'Plug', Icon: Plug },
  { value: 'Infinity', label: 'Infinity', Icon: InfinityIcon },
  { value: 'QrCode', label: 'QR Code', Icon: QrCode },
  { value: 'Barcode', label: 'Barcode', Icon: Barcode },
  { value: 'Scan', label: 'Scan', Icon: Scan },
  { value: 'Bot', label: 'Bot', Icon: Bot },
  { value: 'BrainCircuit', label: 'AI Brain', Icon: BrainCircuit },
  { value: 'Sparkle', label: 'Sparkle', Icon: Sparkle },
  { value: 'Blocks', label: 'Blocks', Icon: Blocks },
  { value: 'Layers', label: 'Layers', Icon: Layers },
  { value: 'LayoutGrid', label: 'Grid Layout', Icon: LayoutGrid },
  { value: 'LayoutList', label: 'List Layout', Icon: LayoutList },
  { value: 'LayoutDashboard', label: 'Dashboard', Icon: LayoutDashboard },
  // New icons - Arrows & Actions
  { value: 'ArrowRight', label: 'Arrow Right', Icon: ArrowRight },
  { value: 'ArrowUp', label: 'Arrow Up', Icon: ArrowUp },
  { value: 'ArrowDown', label: 'Arrow Down', Icon: ArrowDown },
  { value: 'ArrowLeft', label: 'Arrow Left', Icon: ArrowLeft },
  { value: 'RefreshCw', label: 'Refresh', Icon: RefreshCw },
  { value: 'RotateCcw', label: 'Rotate', Icon: RotateCcw },
  { value: 'Repeat', label: 'Repeat', Icon: Repeat },
  { value: 'Shuffle', label: 'Shuffle', Icon: Shuffle },
  { value: 'Move', label: 'Move', Icon: Move },
  { value: 'Maximize2', label: 'Maximize', Icon: Maximize2 },
  { value: 'Minimize2', label: 'Minimize', Icon: Minimize2 },
  // New icons - Alerts & Status
  { value: 'AlertCircle', label: 'Alert Circle', Icon: AlertCircle },
  { value: 'AlertTriangle', label: 'Alert Triangle', Icon: AlertTriangle },
  { value: 'Info', label: 'Info', Icon: Info },
  { value: 'CircleCheck', label: 'Circle Check', Icon: CircleCheck },
  { value: 'CircleX', label: 'Circle X', Icon: CircleX },
  { value: 'CircleAlert', label: 'Circle Alert', Icon: CircleAlert },
  { value: 'BellRing', label: 'Bell Ring', Icon: BellRing },
  { value: 'BellOff', label: 'Bell Off', Icon: BellOff },
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
