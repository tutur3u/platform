'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, MessagesSquare } from '@tuturuuu/icons';
import type { InternalAiChatSummary } from '@tuturuuu/internal-api/ai';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import type { NavLink as ChatNavLink } from '@/components/navigation';
import { Nav } from './nav';

interface RewiseSidebarChatsProps {
  closeOnMobile?: () => void;
  isCollapsed: boolean;
  listChats: () => Promise<InternalAiChatSummary[]>;
  personalOrWsId: string;
}

export function RewiseSidebarChats({
  closeOnMobile,
  isCollapsed,
  listChats,
  personalOrWsId,
}: RewiseSidebarChatsProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { data: chats } = useQuery({
    queryFn: listChats,
    queryKey: ['ai-chats'],
  });

  const chatLinks: ChatNavLink[] = (chats || []).map((chat) => ({
    createdAt: chat.created_at,
    href: `/${personalOrWsId}/c/${chat.id}`,
    pinned: chat.pinned ?? false,
    title: chat.title || t('ai_chat.untitled'),
  }));

  if (isCollapsed) return null;

  return (
    <>
      <Separator className="mx-2" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Accordion
          className={cn('w-full', isCollapsed && 'hidden')}
          collapsible
          type="single"
        >
          <AccordionItem className="border-none p-0" value="chats">
            <AccordionTrigger
              className="mx-2 mb-0 rounded-md bg-foreground/5 px-3 py-2 hover:bg-foreground/10"
              showChevron={false}
            >
              <div className="flex items-center gap-2">
                <MessagesSquare className="h-5 w-5 flex-none" />
                <span className="line-clamp-1 text-start text-sm">
                  {t('ai_chat.chats')}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
            </AccordionTrigger>
            <AccordionContent>
              <Nav
                basePath={`/${personalOrWsId}`}
                className="pt-0"
                currentUser={null}
                isCollapsed={isCollapsed}
                links={chatLinks}
                locale={locale}
                onClick={closeOnMobile}
                single={false}
                t={t}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </>
  );
}
