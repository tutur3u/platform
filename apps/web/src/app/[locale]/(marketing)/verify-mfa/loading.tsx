import { Card, CardContent } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="w-full max-w-md">
        <Card className="overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl">
          <CardContent className="flex h-64 items-center justify-center p-8">
            <div className="flex flex-col items-center gap-3">
              <LoadingIndicator className="h-8 w-8" />
              <span className="text-sm text-muted-foreground">
                Loading verification...
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
