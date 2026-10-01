/// <reference types="vite/client" />
import * as monaco from 'monaco-editor';

Object.assign(window, { qaMonaco: monaco });

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider, useTheme } from 'next-themes';
import { type ComponentProps, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Structure } from '../../../../packages/ui/src/components/ui/custom/structure';
import messages from '../../messages/en.json';
import { CodingLab } from '../../src/app/[locale]/(dashboard)/[wsId]/coding/coding-lab';
import './style.css';
import { CanonicalHarness } from './canonical';

const challenges = [
  {
    slug: 'two-sum',
    difficulty: 'easy',
    topic: 'arrays',
    starterCode:
      'n = int(input())\nnums = list(map(int, input().split()))\ntarget = int(input())\n\n# Print two zero-based indices in ascending order.\n',
    samples: [],
    publicCases: [
      { input: '4\n2 7 11 15\n9\n', output: '0 1\n' },
      { input: '3\n3 2 4\n6\n', output: '1 2\n' },
    ],
  },
  {
    slug: 'binary-search',
    difficulty: 'easy',
    topic: 'search',
    starterCode: 'n = int(input())\n# Binary search\n',
    samples: [],
    publicCases: [{ input: '5\n1 3 5 7 9\n7\n', output: '3\n' }],
  },
] satisfies ComponentProps<typeof CodingLab>['challenges'];
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
function Harness() {
  const [ready, setReady] = useState(false);
  const { setTheme } = useTheme();
  Object.assign(window, { qa: { setReady, setTheme } });
  return (
    <Structure
      contentFullBleed
      sidebarHidden
      isCollapsed
      setIsCollapsed={() => {}}
      sidebarHeader={null}
      sidebarContent={null}
      actions={null}
    >
      <div className="h-dvh">
        <CodingLab
          availableLanguages={
            ready ? ['python', 'javascript', 'typescript'] : []
          }
          challenges={challenges}
          readOnly={false}
          wsId="11111111-1111-4111-8111-111111111111"
        />
      </div>
    </Structure>
  );
}
createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="dark">
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={queryClient}>
        {location.pathname.includes('/programming') ? (
          <CanonicalHarness />
        ) : (
          <Harness />
        )}
      </QueryClientProvider>
    </NextIntlClientProvider>
  </ThemeProvider>
);
