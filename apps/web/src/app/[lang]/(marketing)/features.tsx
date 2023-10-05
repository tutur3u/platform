import {
  PencilIcon,
  CodeBracketIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckCircleIcon,
  BanknotesIcon,
  SparklesIcon,
} from '@heroicons/react/20/solid';
import { Translate } from 'next-translate';

interface Feature {
  title: string;
  subtitle: string;
  url?: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

export const getFeatures = (t: Translate): Feature[] => {
  return [
    {
      title: t('features-1-title'),
      subtitle: t('features-1-subtitle'),
      icon: <SparklesIcon className="h-6 w-6" />,
    },
    {
      title: 'Fully-featured chat',
      subtitle:
        'Fully-featured chatting experience, with support for markdown, code blocks, and more at your fingertips.',
      icon: <ChatBubbleLeftEllipsisIcon className="h-6 w-6" />,
    },
    {
      title: 'Powerful task management',
      subtitle:
        'Manage your tasks with ease, with support for recurring tasks, subtasks, and more.',
      icon: <CheckCircleIcon className="h-6 w-6" />,
    },
    {
      title: 'Intuitive note-taking',
      subtitle:
        'Note-taking has never been easier, with highly customizable note-taking experience.',
      icon: <PencilIcon className="h-6 w-6" />,
    },
    {
      title: 'Robust finance tracker',
      subtitle:
        'Be on top of your finances and track your expenses with our robust finance tracker.',
      icon: <BanknotesIcon className="h-6 w-6" />,
    },
    {
      title: 'Open-source',
      subtitle:
        'We are open-source! Have a feature request or found a bug? Feel free to open an issue or a pull request.',
      url: 'https://github.com/tutur3u/tutur3u',
      icon: <CodeBracketIcon className="h-6 w-6" />,
    },
  ];
};
