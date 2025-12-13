-- Add more icon options to workspace_board_icon enum
-- Source of truth: packages/ui/src/components/ui/custom/icon-picker.tsx (ICON_OPTIONS)

-- Technology & Devices
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Smartphone';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Tablet';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Cpu';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'HardDrive';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Wifi';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Bluetooth';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Camera';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Headphones';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Speaker';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Tv';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Printer';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Keyboard';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Mouse';

-- Business & Finance
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'DollarSign';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Banknote';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Receipt';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Calculator';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'TrendingDown';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'BarChart';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'BarChart2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'LineChart';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Activity';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Coins';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'PiggyBank';

-- Communication
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Send';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'AtSign';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Hash';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'MessageCircle';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'MessagesSquare';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Share';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Share2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Megaphone';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Radio';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Rss';

-- Files & Documents
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'File';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FileCode';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FileImage';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FileAudio';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FileVideo';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FileSpreadsheet';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FileCheck';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FilePlus';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FolderPlus';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FolderCheck';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Archive';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ClipboardCheck';

-- People & Social
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'UserPlus';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'UserCheck';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'UserX';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'UserMinus';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'UsersRound';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'UserRound';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Crown';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Contact';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Handshake';

-- Location & Navigation
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Map';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Navigation';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Compass';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Locate';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Milestone';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Signpost';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Route';

-- Weather & Nature
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Sun';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Cloud';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'CloudRain';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Snowflake';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Wind';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Thermometer';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Umbrella';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Rainbow';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Leaf';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Trees';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Flower2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Mountain';

-- Health & Fitness
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'HeartPulse';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Stethoscope';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Pill';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Syringe';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Dumbbell';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Bike';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Footprints';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Brain';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Salad';

-- Food & Dining
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'UtensilsCrossed';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Coffee';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Wine';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Beer';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Pizza';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Cake';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Cookie';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'IceCream2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Apple';

-- Travel & Transportation
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Plane';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Car';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Bus';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Train';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Ship';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Anchor';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Luggage';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Ticket';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Hotel';

-- Entertainment & Gaming
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Gamepad2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Dice1';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Clapperboard';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Popcorn';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Drama';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'PartyPopper';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Sparkles';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Film';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Tv2';

-- Education & Learning
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Book';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Library';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'PenTool';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Highlighter';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Ruler';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'School';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Presentation';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Languages';

-- Science & Research
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FlaskConical';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Microscope';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Atom';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Dna';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Telescope';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Orbit';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Satellite';

-- Tools & Development
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Code';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Code2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Terminal';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'GitBranch';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'GitMerge';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'GitPullRequest';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Hammer';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Axe';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Scissors';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Brush';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Palette';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Pipette';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Eraser';

-- Shapes & Symbols
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'CircleDot';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Square';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Triangle';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Pentagon';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Hexagon';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Octagon';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Diamond';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Shapes';

-- Security & Privacy
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ShieldCheck';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ShieldAlert';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Fingerprint';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ScanFace';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'KeyRound';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'LockKeyhole';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'UnlockKeyhole';

-- Home & Lifestyle
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Armchair';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Bed';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Bath';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Lamp';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Sofa';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Shirt';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Watch';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Glasses';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Gem';

-- Miscellaneous
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Award';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Medal';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'BadgeCheck';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Flag';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Bookmark2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Pin';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Magnet';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Battery';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Power';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Plug';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Infinity';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'QrCode';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Barcode';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Scan';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Bot';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'BrainCircuit';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Sparkle';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Blocks';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Layers';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'LayoutGrid';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'LayoutList';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'LayoutDashboard';

-- Arrows & Actions
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ArrowRight';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ArrowUp';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ArrowDown';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ArrowLeft';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'RefreshCw';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'RotateCcw';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Repeat';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Shuffle';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Move';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Maximize2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Minimize2';

-- Alerts & Status
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'AlertCircle';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'AlertTriangle';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Info';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'CircleCheck';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'CircleX';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'CircleAlert';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'BellRing';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'BellOff';

