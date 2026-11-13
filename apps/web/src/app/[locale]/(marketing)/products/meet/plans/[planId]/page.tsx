import MeetTogetherPlanDetailsPage from '@tuturuuu/ui/legacy/meet/planId/page';
import { BASE_URL } from '@/constants/common';

export default async function MeetPlanPage({
  params,
}: {
  params: Promise<{ locale: string; planId: string }>;
}) {
  const { locale } = await params;
  return (
    <MeetTogetherPlanDetailsPage
      params={params}
      baseUrl={BASE_URL}
      planBaseUrl={new URL('/products/meet/plans', BASE_URL).toString()}
      planReturnPath={`${locale === 'vi' ? '/vi' : ''}/products/meet`}
    />
  );
}
