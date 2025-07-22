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
      <Card className="border-0 bg-white/60 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-slate-600">
            Total Syncs
          </CardTitle>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
            <Activity className="h-4 w-4 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-3xl font-bold text-slate-900">{totalSyncs}</div>
          <div className="mt-2 flex items-center gap-4 text-xs">
            <span className="font-medium text-green-600">
              {successRate}% success
            </span>
            {failedSyncs > 0 && (
              <span className="font-medium text-red-600">
                {failedSyncs} failed
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/60 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-slate-600">
            Events Added
          </CardTitle>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
            <Plus className="h-4 w-4 text-green-600" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-3xl font-bold text-green-600">
            {totalEvents.added}
          </div>
          <p className="mt-2 text-xs text-slate-500">New calendar events</p>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/60 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-slate-600">
            Events Updated
          </CardTitle>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
            <Edit className="h-4 w-4 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-3xl font-bold text-blue-600">
            {totalEvents.updated}
          </div>
          <p className="mt-2 text-xs text-slate-500">Modified events</p>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/60 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-slate-600">
            Events Deleted
          </CardTitle>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
            <Trash2 className="h-4 w-4 text-red-600" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-3xl font-bold text-red-600">
            {totalEvents.deleted}
          </div>
          <p className="mt-2 text-xs text-slate-500">Removed events</p>
        </CardContent>
      </Card>
    </div>
  );
}
