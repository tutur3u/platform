'use client';

import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Zap } from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

export default function PlatformSubscriptionsMigrationPage() {
  const [migrationResult, setMigrationResult] = useState<any>(null);

  const migrateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/platform/migrate-subscriptions', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Migration failed');
      }

      return data;
    },
    onSuccess: (data) => {
      setMigrationResult(data);
      if (data.errors === 0) {
        toast.success('Migration completed successfully', {
          description: `Processed ${data.processed} subscriptions, skipped ${data.skipped}`,
        });
      } else {
        toast.warning('Migration completed with errors', {
          description: `Processed ${data.processed}, skipped ${data.skipped}, errors ${data.errors}`,
        });
      }
    },
    onError: (error) => {
      toast.error('Migration failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="mb-2 font-bold text-3xl">Platform Subscriptions</h1>
        <p className="text-muted-foreground">
          Global migration tool for admin use only
        </p>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Admin-Only Feature</AlertTitle>
        <AlertDescription>
          This action will migrate ALL active fixed-price subscriptions in the
          system to seat-based pricing with immediate proration invoices. Use
          with extreme caution.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Migrate to Seat-Based Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <p className="font-medium">This migration will:</p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>
                Scan all active subscriptions currently using fixed pricing
              </li>
              <li>
                Find matching seat-based products for the same tier and billing
                cycle
              </li>
              <li>
                Update subscriptions in Polar with immediate proration behavior
              </li>
              <li>Set initial seat count based on current workspace members</li>
              <li>Generate invoices for any pricing differences</li>
            </ul>
          </div>

          {migrationResult && (
            <div className="rounded-lg border bg-muted p-4">
              <h3 className="mb-2 font-semibold">Migration Results</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Processed</p>
                  <p className="font-bold text-lg text-dynamic-green">
                    {migrationResult.processed}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Skipped</p>
                  <p className="font-bold text-lg text-dynamic-yellow">
                    {migrationResult.skipped}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Errors</p>
                  <p className="font-bold text-lg text-dynamic-red">
                    {migrationResult.errors}
                  </p>
                </div>
              </div>
              {migrationResult.errorDetails &&
                migrationResult.errorDetails.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 font-medium text-sm">Error Details:</p>
                    <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
                      {migrationResult.errorDetails.map(
                        (err: any, idx: number) => (
                          <div
                            key={idx}
                            className="rounded bg-destructive/10 p-2"
                          >
                            <span className="font-mono">ID: {err.id}</span> -{' '}
                            {err.error}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              {migrationResult.message && (
                <p className="mt-4 text-muted-foreground text-sm">
                  {migrationResult.message}
                </p>
              )}
            </div>
          )}

          <Button
            onClick={() => migrateMutation.mutate()}
            disabled={migrateMutation.isPending}
            variant="destructive"
            className="w-full"
          >
            {migrateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Migrating...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Execute Global Migration
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
