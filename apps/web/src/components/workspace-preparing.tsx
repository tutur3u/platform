'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { setupWorkspace } from '@/app/[locale]/(dashboard)/[wsId]/actions';

export function WorkspacePreparing({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const setupStarted = useRef(false);

  useEffect(() => {
    if (setupStarted.current) return;
    setupStarted.current = true;

    async function runSetup() {
      try {
        await setupWorkspace(wsId);
        router.refresh();
      } catch (err) {
        console.error('Failed to setup workspace:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    runSetup();
  }, [wsId, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('common.workspace_preparing')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {error ? (
              <span className="font-semibold text-destructive">
                Error: {error}
              </span>
            ) : (
              t('common.workspace_preparing_description')
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
