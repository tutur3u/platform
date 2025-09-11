import type { Metadata } from 'next';
import { AboutUsClient } from './client';

export const metadata: Metadata = {
  title: 'Neo League - Prompt The Future',
  description:
    'This competition is a part of the Neo League, a series of competitions that are held annually to promote the use of innovative technologies in Vietnam.',
};

export default function Page() {
  return <AboutUsClient />;
}
