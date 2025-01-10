import JutePestResearchSlides from './client';
import { DEV_MODE } from '@/constants/common';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Jute Pest Research',
  description:
    'Advanced morphological feature analysis and classification of jute pests using computer vision and machine learning techniques, achieving 97.2% accuracy in species identification.',
  openGraph: {
    type: 'website',
    locale: 'en',
    url: DEV_MODE
      ? 'http://localhost:7803/research/jute-pest'
      : 'https://rmit.tuturuuu.com/research/jute-pest',
    title: 'Jute Pest Research',
    description:
      'Advanced morphological feature analysis and classification of jute pests using computer vision and machine learning techniques, achieving 97.2% accuracy in species identification.',
    siteName: 'Jute Pest Research',
    images: [
      {
        url: DEV_MODE
          ? 'http://localhost:7803/research/jute-pest/og'
          : 'https://rmit.tuturuuu.com/research/jute-pest/og',
        width: 1200,
        height: 630,
        alt: 'Jute Pest Research - Advanced Morphological Analysis',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jute Pest Research - Advanced Morphological Analysis',
    description:
      'Advanced morphological feature analysis and classification of jute pests using computer vision and machine learning techniques, achieving 97.2% accuracy in species identification.',
    images: [
      DEV_MODE
        ? 'http://localhost:7803/research/jute-pest/og'
        : 'https://rmit.tuturuuu.com/research/jute-pest/og',
    ],
    creator: '@tutur3u',
  },
};

export default function ResearchPage() {
  return <JutePestResearchSlides />;
}
