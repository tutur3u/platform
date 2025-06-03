import FeatureSummary from '@ncthub/ui/custom/feature-summary';
import { Separator } from '@ncthub/ui/separator';

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
