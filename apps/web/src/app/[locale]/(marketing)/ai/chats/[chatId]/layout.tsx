import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { AIChat } from '@tuturuuu/types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getMarketingMetadata } from '@/lib/seo/marketing-metadata';

interface Props {
  params: Promise<{
    locale: string;
    chatId: string;
  }>;
}

const getChat = async (chatId: string) => {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('ai_chats')
    .select('*')
    .eq('id', chatId)
    .eq('is_public', true)
    .single();

  if (error) {
    console.error(error);
    notFound();
  }

  return data as AIChat;
};

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale, chatId } = await params;

  const viTitle = 'Trò chuyện AI';
  const enTitle = 'AI Chat';

  const enDefaultDescription =
    'Discuss with AI about anything, anytime, anywhere.';
  const viDefaultDescription =
    'Trò chuyện với AI về mọi thứ, mọi lúc, mọi nơi.';

  const untitled = locale === 'vi' ? 'Chưa đặt tên' : 'Untitled';
  const defaultDescription =
    locale === 'vi' ? viDefaultDescription : enDefaultDescription;

  const chat = await getChat(chatId);

  const chatTitle = chat.title || untitled;
  const chatSummary = chat.summary || defaultDescription;

  const title = `${chatTitle} - ${locale === 'vi' ? viTitle : enTitle}`;
  const description = chatSummary;

  return getMarketingMetadata(
    {
      title,
      description,
      imageAlt: `${title} - Tuturuuu`,
      pathname: `/ai/chats/${chatId}`,
    },
    locale
  );
};

export default async function AIChatDetailsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
