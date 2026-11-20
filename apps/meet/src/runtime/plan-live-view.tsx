import { MeetPlanLiveRoot } from '@tuturuuu/ui/legacy/meet/planId/meet-plan-live-root';
import { isAppMounted } from '@tuturuuu/utils/app-mounts';
import { BASE_URL } from '../constants/common';
import { meetPublicUrl } from '@tuturuuu/utils/meet-url';
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
          baseUrl={isAppMounted('meet') ? meetPublicUrl() : BASE_URL}
          initialSnapshot={model.snapshot}
        />
      </div>
    </PublicLayout>
  );
}
