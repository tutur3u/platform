import { TextGeneratorClient } from './client';
import NeoGeneratorHero from './hero';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Neo Generator | Text Style Generator',
  description:
    'Transform your text into various Unicode styles including bold, italic, script, and more. Perfect for social media posts, messaging, and creative text formatting.',
  keywords:
    'text generator, unicode, bold text, italic text, fancy text, social media formatting',
};

export default function NeoGeneratorPage() {
  return (
    <div className="container mx-auto px-4 py-14">
      <div className="mx-auto max-w-4xl">
        <NeoGeneratorHero />
        <TextGeneratorClient />
      </div>
    </div>
  );
}
