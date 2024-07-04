import { siteConfig } from '@/constants/configs';
import { AIChat } from '@/types/db';
import { createAdminClient } from '@/utils/supabase/server';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    locale: string;
    chatId: string;
  };
}

const getChat = async (chatId: string) => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
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
  params: { locale, chatId },
}: Props): Promise<Metadata> => {
  try {
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

    return {
      title: {
        default: title,
        template: `%s - ${title}`,
      },
      description,
      openGraph: {
        type: 'website',
        locale,
        url: siteConfig.url,
        title,
        description,
        siteName: siteConfig.name,
        images: [
          {
            url: siteConfig.ogImage,
            width: 1200,
            height: 630,
            alt: `${title} - ${siteConfig.name}`,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [siteConfig.ogImage],
        creator: '@tutur3u',
      },
    };
  } catch (error) {
    console.error(error);
    notFound();
  }
};

export default async function AIChatDetailsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
