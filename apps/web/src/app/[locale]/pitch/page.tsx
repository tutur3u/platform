import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';
import { PitchDeck } from '@/components/pitch/pitch-deck';
import type { PitchCopy } from '@/components/pitch/pitch-model';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pitch');
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: true },
  };
}

export default async function PitchPage() {
  const messages = await getMessages();
  return <PitchDeck copy={messages.pitch as PitchCopy} />;
}
