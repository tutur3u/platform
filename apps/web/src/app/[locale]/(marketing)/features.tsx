import {
  BanknotesIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckCircleIcon,
  CodeBracketIcon,
  PencilIcon,
  SparklesIcon,
} from '@heroicons/react/20/solid';
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
      icon: <SparklesIcon className="h-6 w-6" />,
    },
    {
      title: t('home.features-2-title'),
      subtitle: t('home.features-2-subtitle'),
      icon: <ChatBubbleLeftEllipsisIcon className="h-6 w-6" />,
    },
    {
      title: t('home.features-3-title'),
      subtitle: t('home.features-3-subtitle'),
      icon: <CheckCircleIcon className="h-6 w-6" />,
    },
    {
      title: t('home.features-4-title'),
      subtitle: t('home.features-4-subtitle'),
      icon: <PencilIcon className="h-6 w-6" />,
    },
    {
      title: t('home.features-5-title'),
      subtitle: t('home.features-5-subtitle'),
      icon: <BanknotesIcon className="h-6 w-6" />,
    },
    {
      title: t('home.features-6-title'),
      subtitle: t('home.features-6-subtitle'),
      url: 'https://github.com/tutur3u/platform',
      icon: <CodeBracketIcon className="h-6 w-6" />,
    },
  ];
}
