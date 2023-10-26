import StatisticCard from '@/components/cards/StatisticCard';

export default function InfrastructureOverviewPage() {
  return (
    <div className="grid flex-col gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatisticCard loading />
      <StatisticCard loading />
    </div>
  );
}
