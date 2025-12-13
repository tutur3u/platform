-- Enforce valid board icons via enum
-- Source of truth: packages/ui/src/components/ui/custom/icon-picker.tsx (ICON_OPTIONS)
-- When adding/removing icons in ICON_OPTIONS, update this enum via a new migration.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'workspace_board_icon'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.workspace_board_icon AS ENUM (
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
      'Trophy'
    );
  END IF;
END $$;

-- If the enum already existed, ensure all values exist (idempotent on Postgres 15+).
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Users';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'User';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Briefcase';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Target';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Rocket';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'TrendingUp';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ClipboardList';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ListChecks';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'CheckSquare';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Calendar';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'CalendarDays';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'CalendarCheck';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Clock';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'AlarmClock';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Bell';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Star';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Settings';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Shield';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Tag';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Folder';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FolderOpen';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'FileText';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Database';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Server';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Inbox';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Mail';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'MessageSquare';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Phone';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Video';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Mic';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Image';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Paperclip';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Link';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ExternalLink';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Download';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Upload';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Search';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Eye';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'EyeOff';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Lock';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Key';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Wrench';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Paintbrush';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Wand2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Lightbulb';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Bug';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'GraduationCap';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'BookOpen';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Bookmark';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Newspaper';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'PieChart';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Play';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'PlusSquare';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Puzzle';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Package';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Truck';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Monitor';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Laptop';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Music';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Timer';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Trash2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Heart';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'HelpCircle';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Moon';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Zap';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Flame';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Gift';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Globe';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'MapPin';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Home';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Building2';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ShoppingCart';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'CreditCard';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Wallet';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'ThumbsUp';
ALTER TYPE public.workspace_board_icon ADD VALUE IF NOT EXISTS 'Trophy';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_boards'
      AND column_name = 'icon'
  ) THEN
    -- Drop old length check (no longer needed for enum).
    ALTER TABLE public.workspace_boards
    DROP CONSTRAINT IF EXISTS workspace_boards_icon_length_check;

    -- Null any invalid legacy values before converting.
    UPDATE public.workspace_boards
    SET icon = NULL
    WHERE icon IS NOT NULL
      AND icon NOT IN (
        'Users','User','Briefcase','Target','Rocket','TrendingUp','ClipboardList','ListChecks',
        'CheckSquare','Calendar','CalendarDays','CalendarCheck','Clock','AlarmClock','Bell','Star',
        'Settings','Shield','Tag','Folder','FolderOpen','FileText','Database','Server','Inbox','Mail',
        'MessageSquare','Phone','Video','Mic','Image','Paperclip','Link','ExternalLink','Download','Upload',
        'Search','Eye','EyeOff','Lock','Key','Wrench','Paintbrush','Wand2','Lightbulb','Bug','GraduationCap',
        'BookOpen','Bookmark','Newspaper','PieChart','Play','PlusSquare','Puzzle','Package','Truck','Monitor',
        'Laptop','Music','Timer','Trash2','Heart','HelpCircle','Moon','Zap','Flame','Gift','Globe','MapPin',
        'Home','Building2','ShoppingCart','CreditCard','Wallet','ThumbsUp','Trophy'
      );

    -- Convert column type to enum (will now succeed).
    ALTER TABLE public.workspace_boards
    ALTER COLUMN icon TYPE public.workspace_board_icon
    USING icon::public.workspace_board_icon;
  END IF;
END $$;

