import { siteConfig } from '@/constants/configs';
import { AIChat } from '@/types/db';
import { createAdminClient } from '@/utils/supabase/client';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    lang: string;
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

export async function generateMetadata({
  params: { lang, chatId },
}: Props): Promise<Metadata> {
  const viTitle = 'Trò chuyện AI';
  const enTitle = 'AI Chat';

  const enDescription = 'AI Discussion Experiment';
  const viDescription = 'Thử nghiệm trò chuyện AI';

  const untitled = lang === 'vi' ? 'Chưa đặt tên' : 'Untitled';

  const chat = await getChat(chatId);
  const chatTitle = chat.title || untitled;

  const title = `${chatTitle} - ${lang === 'vi' ? viTitle : enTitle}`;
  const description = lang === 'vi' ? viDescription : enDescription;

  return {
    title: {
      default: title,
      template: `%s - ${title}`,
    },
    description,
    openGraph: {
      type: 'website',
      locale: lang,
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
}

export default async function AIChatDetailsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
