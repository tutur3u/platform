import { MeetPlanLiveRoot } from '@tuturuuu/ui/legacy/meet/planId/meet-plan-live-root';
import { currentMeetBaseUrl } from './bridge-runtime';
import type { MeetPageModel } from './page-model.server';
import { PublicLayout } from './public-layout';

/** Loaded on demand: the live plan editor is only needed on `/plans/<id>`. */
export default function PlanLiveView({
  model,
}: {
  model: Extract<MeetPageModel, { kind: 'plan' }>;
}) {
  return (
    <PublicLayout>
      <div className="flex min-h-screen w-full flex-col items-center">
        <MeetPlanLiveRoot
          platformUser={model.profile}
          baseUrl={currentMeetBaseUrl()}
          planBaseUrl={`${currentMeetBaseUrl()}/plans`}
          initialSnapshot={model.snapshot}
        />
      </div>
    </PublicLayout>
  );
}
