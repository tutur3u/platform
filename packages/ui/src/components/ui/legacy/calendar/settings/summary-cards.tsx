'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Activity, Edit, Plus, Trash2 } from 'lucide-react';

interface SummaryCardsProps {
  totalSyncs: number;
  successRate: string;
  failedSyncs: number;
  totalEvents: {
    added: number;
    updated: number;
    deleted: number;
  };
}

export function SummaryCards({
  totalSyncs,
  successRate,
  failedSyncs,
  totalEvents,
}: SummaryCardsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card className="border-0 bg-foreground/10 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="font-medium text-sm">Total Syncs</CardTitle>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-blue/10">
            <Activity className="h-4 w-4 text-dynamic-blue" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="font-bold text-3xl">{totalSyncs}</div>
          <div className="mt-2 flex items-center gap-4 text-xs">
            <span className="font-medium text-dynamic-green">
              {successRate}% success
            </span>
            {failedSyncs > 0 && (
              <span className="font-medium text-dynamic-red">
                {failedSyncs} failed
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-foreground/10 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="font-medium text-sm">Events Added</CardTitle>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-green/10">
            <Plus className="h-4 w-4 text-dynamic-green" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="font-bold text-3xl text-dynamic-green">
            {totalEvents.added}
          </div>
          <p className="mt-2 text-xs opacity-70">New calendar events</p>
        </CardContent>
      </Card>

      <Card className="border-0 bg-foreground/10 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="font-medium text-sm">Events Updated</CardTitle>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-blue/10">
            <Edit className="h-4 w-4 text-dynamic-blue" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="font-bold text-3xl text-dynamic-blue">
            {totalEvents.updated}
          </div>
          <p className="mt-2 text-xs opacity-70">Modified events</p>
        </CardContent>
      </Card>

      <Card className="border-0 bg-foreground/10 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="font-medium text-sm">Events Deleted</CardTitle>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-red/10">
            <Trash2 className="h-4 w-4 text-dynamic-red" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="font-bold text-3xl text-dynamic-red">
            {totalEvents.deleted}
          </div>
          <p className="mt-2 text-xs opacity-70">Removed events</p>
        </CardContent>
      </Card>
    </div>
  );
}
