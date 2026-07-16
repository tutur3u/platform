import { createNovaPageMetadata } from '@/lib/page-metadata';
import { AboutUsClient } from './client';

export const generateMetadata = createNovaPageMetadata({
  title: 'Neo League - Prompt The Future',
  description:
    'This competition is a part of the Neo League, a series of competitions that are held annually to promote the use of innovative technologies in Vietnam.',
  pathname: '/competitions/neo-league/prompt-the-future/about',
});

export default function Page() {
  return <AboutUsClient />;
}
