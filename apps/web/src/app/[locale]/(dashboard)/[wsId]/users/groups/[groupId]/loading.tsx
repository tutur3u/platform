import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';

function Loading() {
  return (
    <>
      <FeatureSummary
        title={<div className="font-bold text-2xl">...</div>}
        description="..."
      />
      <Separator className="my-4" />
    </>
  );
}

export default Loading;
