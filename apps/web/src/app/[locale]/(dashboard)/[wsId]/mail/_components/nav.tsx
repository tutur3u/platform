'use client';

import { NavLink } from './link';
import {
  Mail as MailIcon,
  Send,
  Star,
  TextSelect,
  Trash,
  TriangleAlert,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

interface NavProps {
  isCollapsed: boolean;
  onCollapse: () => void;
}

export function Nav({ isCollapsed, onCollapse }: NavProps) {
  const t = useTranslations();

  return (
    <div
      data-collapsed={isCollapsed}
      className={cn(
        'group flex flex-col gap-4 px-2 transition-all duration-300 ease-in-out'
      )}
    >
      <nav
        className={cn(
          'mt-16 grid gap-1',
          'data-[collapsed=true]:justify-center'
        )}
      >
        <div className="grid gap-1 py-2">
          <NavLink
            href="#"
            isCollapsed={isCollapsed}
            label={t('mail.inbox')}
            icon={<MailIcon className="size-4" />}
            disabled
          />
          <NavLink
            href="#"
            isCollapsed={isCollapsed}
            label={t('mail.starred')}
            icon={<Star className="size-4" />}
            disabled
          />
          <NavLink
            href="#"
            isCollapsed={isCollapsed}
            label={t('mail.sent')}
            icon={<Send className="size-4" />}
          />
          <NavLink
            href="#"
            isCollapsed={isCollapsed}
            label={t('mail.drafts')}
            icon={<TextSelect className="size-4" />}
            disabled
          />
          <NavLink
            href="#"
            isCollapsed={isCollapsed}
            label={t('mail.spam')}
            icon={<TriangleAlert className="size-4" />}
            disabled
          />
          <NavLink
            href="#"
            isCollapsed={isCollapsed}
            label={t('mail.trash')}
            icon={<Trash className="size-4" />}
            disabled
          />
        </div>
      </nav>
    </div>
  );
}
