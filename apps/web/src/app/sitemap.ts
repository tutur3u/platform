import type { MetadataRoute } from 'next';
import { BASE_URL } from '@/constants/common';

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ['', '/en', '/vi'];

  // Define paths with their priorities and change frequencies
  const routes: {
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  }[] = [
    { path: '', priority: 1.0, changeFrequency: 'weekly' }, // Homepage
    { path: '/about', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/achievements', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/projects', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/branding', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/contributors', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/meet-together', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/neo-generator', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/neo-meeting-agent', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/neo-crush', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/neo-chess', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/neo-pacman', priority: 0.4, changeFrequency: 'yearly' },
  ];

  const urls: MetadataRoute.Sitemap = [];

  for (const route of routes) {
    for (const locale of locales) {
      urls.push({
        url: `${BASE_URL}${locale}${route.path}`,
        lastModified: new Date(),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
      });
    }
  }

  return urls;
}
