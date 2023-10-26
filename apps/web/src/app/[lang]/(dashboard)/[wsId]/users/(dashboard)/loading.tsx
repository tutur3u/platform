import StatisticCard from '@/components/cards/StatisticCard';

export default async function Loading() {
  return (
    <div className="grid items-end gap-4 md:grid-cols-2 lg:grid-cols-3">
      <StatisticCard loading />
      <StatisticCard loading />
      <StatisticCard loading />
    </div>
  );
}
