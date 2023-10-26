import useTranslation from 'next-translate/useTranslation';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function Loading() {
  const { t } = useTranslation('ws-home');
  const usersLabel = t('sidebar-tabs:users');

  return (
    <div className="grid items-end gap-4 md:grid-cols-2 lg:grid-cols-3">
      <StatisticCard title={usersLabel} loading />
      <StatisticCard title={t('workspace-users-tabs:groups')} loading />
      <StatisticCard title={t('workspace-users-tabs:reports')} loading />
    </div>
  );
}
