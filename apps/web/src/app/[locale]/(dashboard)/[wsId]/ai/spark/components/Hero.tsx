'use client';

import { Badge } from '@repo/ui/components/ui/badge';

export function Hero() {
  return (
    <div className="text-center">
      <Badge variant="secondary" className="mb-4">
        Beta
      </Badge>
      <h1 className="mb-4 text-4xl font-bold">Spark AI Year Planner</h1>
      <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
        Transform your yearly goals into actionable daily tasks with AI-powered
        planning. Let Spark help you create a detailed roadmap for success.
      </p>
    </div>
  );
}
