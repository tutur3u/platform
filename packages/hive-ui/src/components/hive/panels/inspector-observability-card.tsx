import { SlidersHorizontal } from '@tuturuuu/icons';
import type { HiveRealtimeStatus } from '../../../realtime/hive-realtime-client';

type InspectorObservabilityCardProps = {
  eventsCount: number;
  presenceCount: number;
  realtimeStatus: HiveRealtimeStatus;
  revision: number;
};

export function InspectorObservabilityCard({
  eventsCount,
  presenceCount,
  realtimeStatus,
  revision,
}: InspectorObservabilityCardProps) {
  return (
    <section className="rounded-lg border border-border/20 bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-zinc-200">
        <SlidersHorizontal className="h-4 w-4 text-dynamic-green" />
        <span className="font-medium">Observability</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-zinc-500">Realtime</dt>
          <dd className="text-zinc-300">{realtimeStatus}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Online</dt>
          <dd className="text-zinc-300">{presenceCount}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Revision</dt>
          <dd className="text-zinc-300">{revision}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Events</dt>
          <dd className="text-zinc-300">{eventsCount}</dd>
        </div>
      </dl>
    </section>
  );
}
