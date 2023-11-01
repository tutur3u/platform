import LoadingStatisticCard from '@/components/loading-statistic-card';

export default function Loading() {
  return (
    <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
      <LoadingStatisticCard className="md:col-span-2" />
      <LoadingStatisticCard />
      <LoadingStatisticCard />
      <LoadingStatisticCard />
      <LoadingStatisticCard />
      <LoadingStatisticCard />
      <LoadingStatisticCard />
    </div>
  );
}
