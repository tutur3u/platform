'use client';

import { Card, CardContent } from '@tuturuuu/ui/card';

export function KanbanSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Loading skeleton for search bar */}
      <Card className="mb-4 border-dynamic-blue/20 bg-dynamic-blue/5">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <div className="h-9 w-full animate-pulse rounded-md bg-dynamic-blue/10"></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-16 animate-pulse rounded-md bg-dynamic-blue/10"></div>
              <div className="h-8 w-20 animate-pulse rounded-md bg-dynamic-blue/10"></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading skeleton for kanban columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full gap-4 p-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-full w-87.5 animate-pulse">
              <div className="p-4">
                <div className="mb-4 h-6 w-32 rounded bg-muted"></div>
                <div className="space-y-3">
                  {[1, 2, 3].map((j) => (
                    <div
                      key={j}
                      className="h-24 w-full rounded bg-muted/50"
                    ></div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
