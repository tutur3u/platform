'use client';

import {
  Award,
  BookOpen,
  Bot,
  Calendar,
  Gamepad2,
  GitBranch,
  NotebookPen,
  Puzzle,
  ScanLine,
  Sparkles,
} from '@ncthub/ui/icons';
import type { ReactNode } from 'react';

export interface NavItem {
  href: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  external?: boolean;
  badge?: string;
}

export interface NavCategory {
  title: string;
  items: NavItem[];
}

export const useNavigation = (t: any): { categories: NavCategory[] } => {
  const main = [
    { href: '/', label: t('common.home'), description: '' },
    { href: '/about', label: t('common.about'), description: '' },
  ];

  const resources = [
    {
      href: '/achievements',
      label: t('common.hall-of-fame'),
      description:
        "Celebrating our teams' outstanding achievements in competitions, hackathons, and innovation challenges.",
      icon: <Award />,
    },
    {
      href: '/contributors',
      label: t('common.contributors'),
      description:
        'Celebrate the builders and designers who contribute to NCT Hub.',
      icon: <GitBranch />,
    },
    {
      href: '/projects',
      label: t('common.projects'),
      description:
        'Explore our flagship NCT Hub Platform and student projects.',
      icon: <Bot />,
    },
    {
      href: 'https://docs.rmitnct.club',
      label: t('common.documentation'),
      description: 'Find detailed documentation and guides for developers.',
      icon: <BookOpen />,
      external: true,
    },
  ] as NavItem[];

  const utilities = [
    {
      href: '/meet-together',
      label: t('common.meet-together'),
      description: 'Find the best time slot for everyone, hassle-free.',
      icon: <Calendar />,
    },
    {
      href: '/neo-meeting-agent',
      label: 'Neo Meeting Agent',
      description: 'Automate minutes of meetings and summaries.',
      icon: <NotebookPen />,
    },
    {
      href: '/neo-generator',
      label: 'Neo Generator',
      description:
        'Transform your text into various Unicode styles including bold, italic, script, and more.',
      icon: <Sparkles />,
    },
    {
      href: '/scanner',
      label: 'Scanner',
      description:
        'Effortlessly capture and manage student information with AI-powered scanning technology.',
      icon: <ScanLine />,
    },
  ] as NavItem[];

  const games = [
    {
      href: '/neo-crush',
      label: 'Neo Crush',
      description:
        'Challenge yourself with this addictive match-3 puzzle game.',
      icon: <Puzzle />,
    },
    {
      href: '/neo-chess',
      label: 'Neo Chess',
      description: 'Play the classic game of chess with a modern twist.',
      icon: <Gamepad2 />,
    },
    {
      href: '/neo-pacman',
      label: 'Neo Pacman',
      description: 'Navigate the maze and eat all the ghosts to win.',
      icon: <Gamepad2 />,
    },
  ] as NavItem[];

  return {
    categories: [
      { title: 'main', items: main },
      { title: 'resources', items: resources },
      { title: 'utilities', items: utilities },
      { title: 'games', items: games },
    ],
  };
};
