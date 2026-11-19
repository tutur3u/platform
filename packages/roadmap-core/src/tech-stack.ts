export type TechStack = {
  framework: 'next' | 'start' | 'other';
  bundler: 'next' | 'vitePlus' | 'vitePlusVoid' | 'vite' | 'other';
  hosting: 'vercel' | 'openNext' | 'nativeWorker' | null;
  deployCli: 'cf' | 'wrangler' | null;
  url: string | null;
};

export type AppTechStack = {
  id: string;
  current: TechStack;
} & (
  | { status: 'paused' | 'outside'; targetUrl?: never }
  | { status: 'held' | 'candidate' | 'cutOver'; targetUrl: string }
);

export const TARGET_TECH_STACK = {
  framework: 'start',
  bundler: 'vitePlusVoid',
  hosting: 'nativeWorker',
  deployCli: 'cf',
} satisfies Omit<TechStack, 'url'>;

export const BUILD_TECH_STACK: readonly AppTechStack[] =
  typeof __ROADMAP_TECH_STACK__ === 'undefined' ? [] : __ROADMAP_TECH_STACK__;
