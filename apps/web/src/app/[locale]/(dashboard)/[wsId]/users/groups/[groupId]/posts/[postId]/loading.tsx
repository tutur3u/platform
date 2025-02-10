import FeatureSummary from '@tutur3u/ui/components/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { Check, CircleHelp, Send, X } from 'lucide-react';

export default function Loading() {
  return (
    <div>
      <FeatureSummary
        title={<div className="text-2xl font-bold">...</div>}
        description="..."
      />
      <Separator className="my-4" />
      <div className="gird-cols-1 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="border-dynamic-purple/15 bg-dynamic-purple/15 text-dynamic-purple flex w-full flex-col items-center gap-1 rounded border p-4">
          <div className="flex items-center gap-2 text-xl font-bold">
            <Send />
            Email sent
          </div>
          <Separator className="bg-dynamic-purple/15 my-1" />
          <div className="text-xl font-semibold md:text-3xl">
            -<span className="opacity-50">/-</span>
          </div>
        </div>
        <div className="border-dynamic-green/15 bg-dynamic-green/15 text-dynamic-green flex w-full flex-col items-center gap-1 rounded border p-4">
          <div className="flex items-center gap-2 text-xl font-bold">
            <Check />
            Checked
          </div>
          <Separator className="bg-dynamic-green/15 my-1" />
          <div className="text-3xl font-semibold">
            -<span className="opacity-50">/-</span>
          </div>
        </div>
        <div className="border-dynamic-red/15 bg-dynamic-red/15 text-dynamic-red flex w-full flex-col items-center gap-1 rounded border p-4">
          <div className="flex items-center gap-2 text-xl font-bold">
            <X />
            Failed
          </div>
          <Separator className="bg-dynamic-red/15 my-1" />
          <div className="text-3xl font-semibold">
            -<span className="opacity-50">/-</span>
          </div>
        </div>
        <div className="border-dynamic-blue/15 bg-dynamic-blue/15 text-dynamic-blue flex w-full flex-col items-center gap-1 rounded border p-4">
          <div className="flex items-center gap-2 text-xl font-bold">
            <CircleHelp />
            Unknown
          </div>
          <Separator className="bg-dynamic-blue/15 my-1" />
          <div className="text-3xl font-semibold">
            -<span className="opacity-50">/-</span>
          </div>
        </div>
      </div>
      <Separator className="my-4" />
    </div>
  );
}
