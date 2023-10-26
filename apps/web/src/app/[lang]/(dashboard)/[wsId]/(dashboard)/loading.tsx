import { Separator } from '@/components/ui/separator';
import StatisticCard from '@/components/cards/StatisticCard';

export default function Loading() {
  return (
    <>
      <div className="border-foreground/10 bg-foreground/5 rounded-lg border p-4">
        <h1 className="text-2xl font-bold text-transparent">Home</h1>
        <p className="text-transparent">Description</p>
      </div>

      <Separator className="my-4" />
      <div className="mb-2 text-2xl font-semibold text-transparent">
        Finance
      </div>
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatisticCard className="md:col-span-2" loading />
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
      </div>

      <Separator className="mb-8 mt-4" />
      <div className="mb-2 text-2xl font-semibold text-transparent">
        Inventory
      </div>
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
      </div>

      <Separator className="mb-8 mt-4" />
      <div className="mb-2 text-2xl font-semibold text-transparent">Users</div>
      <div className="grid items-end gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatisticCard loading />
        <StatisticCard loading />
        <StatisticCard loading />
      </div>
    </>
  );
}
