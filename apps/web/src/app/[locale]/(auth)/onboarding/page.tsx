import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { type SearchParams, WelcomeRuntime } from './welcome-runtime';

export const metadata: Metadata = {
  description: 'A short, skippable welcome to your Tuturuuu account.',
  robots: NO_INDEX_ROBOTS,
  title: 'Welcome to Tuturuuu',
};

/**
 * `/onboarding` renders the welcome flow for a signed-in user who has not
 * finished or skipped it. Signed-out visitors go to sign in, and everyone
 * else goes to their workspace; `?replay=1` (Settings) shows it again.
 */
export default function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-root-background" />}>
      <WelcomeRuntime searchParams={searchParams} />
    </Suspense>
  );
}
