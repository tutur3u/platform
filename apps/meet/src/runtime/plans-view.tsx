import { PlansPageContent } from '@tuturuuu/ui/legacy/meet/plans-page-content';

import type { MeetPageModel } from './page-model.server';

type PlansModel = Extract<
  MeetPageModel,
  { kind: 'public-plans' | 'workspace-plans' }
>;

export function PlansView({ model }: { model: PlansModel }) {
  const {
    locale,
    paging: { page, pageSize },
    plans: { data: plans, user, totalCount },
  } = model;
  return (
    <PlansPageContent
      locale={locale}
      page={page}
      pageSize={pageSize}
      path="/plans"
      plans={plans}
      totalCount={totalCount}
      user={user}
      wsId={model.kind === 'workspace-plans' ? model.workspace.wsId : undefined}
    />
  );
}
