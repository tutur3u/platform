import { TextGeneratorClient } from './client';
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
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="mb-4 text-4xl font-bold">
            <span className="bg-gradient-to-r from-[#5FC6E5] to-[#FBC721] bg-clip-text text-transparent">
              Neo Generator
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Transform your text into various Unicode styles including bold,
            italic, script, and more. Perfect for social media posts where
            regular formatting isn't available.
          </p>
        </div>

        <TextGeneratorClient />
      </div>
    </div>
  );
}
