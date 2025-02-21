import { siteConfig } from '@/constants/configs';
import { createAdminClient } from '@tutur3u/supabase/next/server';
import { AIChat } from '@tutur3u/types/db';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';

interface Props {
  params: Promise<{
    locale: string;
    chatId: string;
  }>;
}

const getChat = async (chatId: string) => {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('ai_chats')
    .select('*')
    .eq('id', chatId)
    .eq('is_public', true)
    .maybeSingle();

  if (error) {
    console.error(error);
    notFound();
  }

  return data as AIChat | null;
};

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale, chatId } = await params;

  const enDefaultDescription =
    'Discuss with AI about anything, anytime, anywhere.';
  const viDefaultDescription =
    'Trò chuyện với AI về mọi thứ, mọi lúc, mọi nơi.';

  const untitled = locale === 'vi' ? 'Chưa đặt tên' : 'Untitled';
  const defaultDescription =
    locale === 'vi' ? viDefaultDescription : enDefaultDescription;

  const chat = await getChat(chatId);

  const chatTitle = chat?.title || untitled;
  const chatSummary = chat?.summary || defaultDescription;

  const title = chatTitle;
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
};

export default async function AIChatDetailsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
