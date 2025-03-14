'use client';

import {
  CrossAppButton,
  CrossAppLink,
  useCrossAppNavigation,
} from '@tuturuuu/auth/cross-app';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useCallback } from 'react';

export default function CrossAppExample() {
  const supabase = createClient();
  const { navigateTo, createLink } = useCrossAppNavigation(supabase, 'web');

  const handleNavigateToNova = useCallback(async () => {
    await navigateTo(
      process.env.NODE_ENV === 'production'
        ? 'https://nova.tuturuuu.com'
        : 'http://localhost:7804',
      '/dashboard',
      'nova'
    );
  }, [navigateTo]);

  const handleNavigateToMira = useCallback(async () => {
    await navigateTo(
      process.env.NODE_ENV === 'production'
        ? 'https://mira.tuturuuu.com'
        : 'http://localhost:7805',
      '/dashboard',
      'mira'
    );
  }, [navigateTo]);

  const handleCreateNovaLink = useCallback(async () => {
    const link = await createLink(
      process.env.NODE_ENV === 'production'
        ? 'https://nova.tuturuuu.com'
        : 'http://localhost:7804',
      '/dashboard',
      'nova'
    );

    // Copy the link to clipboard
    navigator.clipboard.writeText(link);
    alert('Link copied to clipboard!');
  }, [createLink]);

  return (
    <div className="container mx-auto py-8">
      <h1 className="mb-6 text-3xl font-bold">Cross-App Navigation Examples</h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Example 1: Using the CrossAppButton component */}
        <Card>
          <CardHeader>
            <CardTitle>CrossAppButton Component</CardTitle>
            <CardDescription>
              Navigate to Nova app using the CrossAppButton component
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CrossAppButton
              supabase={supabase}
              originApp="web"
              targetApp="nova"
              targetAppUrl={
                process.env.NODE_ENV === 'production'
                  ? 'https://nova.tuturuuu.com'
                  : 'http://localhost:7804'
              }
              targetPath="/dashboard"
              className="rounded bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600"
            >
              Go to Nova
            </CrossAppButton>
          </CardContent>
        </Card>

        {/* Example 2: Using the CrossAppLink component */}
        <Card>
          <CardHeader>
            <CardTitle>CrossAppLink Component</CardTitle>
            <CardDescription>
              Navigate to Mira app using the CrossAppLink component
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CrossAppLink
              supabase={supabase}
              originApp="web"
              targetApp="mira"
              targetAppUrl={
                process.env.NODE_ENV === 'production'
                  ? 'https://mira.tuturuuu.com'
                  : 'http://localhost:7805'
              }
              targetPath="/dashboard"
              className="text-blue-500 underline hover:text-blue-600"
            >
              Go to Mira
            </CrossAppLink>
          </CardContent>
        </Card>

        {/* Example 3: Using the useCrossAppNavigation hook */}
        <Card>
          <CardHeader>
            <CardTitle>useCrossAppNavigation Hook</CardTitle>
            <CardDescription>
              Navigate to Nova app using the useCrossAppNavigation hook
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleNavigateToNova} className="w-full">
              Go to Nova
            </Button>

            <Button onClick={handleNavigateToMira} className="w-full">
              Go to Mira
            </Button>

            <Button
              onClick={handleCreateNovaLink}
              variant="outline"
              className="w-full"
            >
              Create Nova Link
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
