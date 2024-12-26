import {
  Banknote,
  Code,
  ListCheck,
  MessageCircle,
  PencilRuler,
  Sparkles,
} from 'lucide-react';
import { ReactNode } from 'react';

interface Feature {
  title: string;
  subtitle: string;
  url?: string;
  icon: ReactNode;
}

export function getFeatures(t: any): Feature[] {
  return [
    {
      title: t('home.features-1-title'),
      subtitle: t('home.features-1-subtitle'),
      icon: <Sparkles className="h-6 w-6" />,
    },
    {
      title: t('home.features-2-title'),
      subtitle: t('home.features-2-subtitle'),
      icon: <MessageCircle className="h-6 w-6" />,
    },
    {
      title: t('home.features-3-title'),
      subtitle: t('home.features-3-subtitle'),
      icon: <ListCheck className="h-6 w-6" />,
    },
    {
      title: t('home.features-4-title'),
      subtitle: t('home.features-4-subtitle'),
      icon: <PencilRuler className="h-6 w-6" />,
    },
    {
      title: t('home.features-5-title'),
      subtitle: t('home.features-5-subtitle'),
      icon: <Banknote className="h-6 w-6" />,
    },
    {
      title: t('home.features-6-title'),
      subtitle: t('home.features-6-subtitle'),
      url: 'https://github.com/tutur3u/platform',
      icon: <Code className="h-6 w-6" />,
    },
  ];
}
