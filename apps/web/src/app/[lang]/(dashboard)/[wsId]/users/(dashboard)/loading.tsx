import LoadingStatisticCard from '@/components/loading-statistic-card';

export default function Loading() {
  return (
    <div className="grid items-end gap-4 md:grid-cols-2 lg:grid-cols-3">
      <LoadingStatisticCard />
      <LoadingStatisticCard />
      <LoadingStatisticCard />
    </div>
  );
}
