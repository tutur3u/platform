import LoadingStatisticCard from '@/components/loading-statistic-card';

export default function InfrastructureOverviewPage() {
  return (
    <div className="grid flex-col gap-4 md:grid-cols-2 xl:grid-cols-4">
      <LoadingStatisticCard />
      <LoadingStatisticCard />
      <LoadingStatisticCard />
      <LoadingStatisticCard />
    </div>
  );
}
