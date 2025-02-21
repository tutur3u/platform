import FeatureSummary from '@tutur3u/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/separator';

function Loading() {
  return (
    <>
      <FeatureSummary
        title={<div className="text-2xl font-bold">...</div>}
        description="..."
      />
      <Separator className="my-4" />
    </>
  );
}

export default Loading;
