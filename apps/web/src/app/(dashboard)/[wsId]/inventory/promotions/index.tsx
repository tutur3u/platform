'use client';

import { useEffect, useState } from 'react';
import { Divider, Pagination, Switch, TextInput } from '@mantine/core';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import StatusSelector from '../../../../../components/selectors/StatusSelector';
import PlusCardButton from '../../../../../components/common/PlusCardButton';
import PromotionCard from '../../../../../components/cards/PromotionCard';
import ModeSelector, {
  Mode,
} from '../../../../../components/selectors/ModeSelector';
import { useLocalStorage } from '@mantine/hooks';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';

export default function PromotionsPage() {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Kho hàng', href: `/${ws.id}/inventory` },
            {
              content: 'Mã giảm giá',
              href: `/${ws.id}/inventory/promotions`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [query, setQuery] = useState('');

  const [showProjectName, setShowProjectName] = useLocalStorage({
    key: 'inventory-promotions-showProjectName',
    defaultValue: false,
  });

  const [showDescription, setShowDescription] = useLocalStorage({
    key: 'inventory-promotions-showDescription',
    defaultValue: true,
  });

  const [showLimits, setShowLimits] = useLocalStorage({
    key: 'inventory-promotions-showLimits',
    defaultValue: false,
  });

  const [showStartDate, setShowStartDate] = useLocalStorage({
    key: 'inventory-promotions-showStartDate',
    defaultValue: false,
  });

  const [showEndDate, setShowEndDate] = useLocalStorage({
    key: 'inventory-promotions-showEndDate',
    defaultValue: false,
  });

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'inventory-promotions-mode',
    defaultValue: 'grid',
  });

  const [activePage, setPage] = useState(1);

  if (!ws) return null;

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TextInput
          label="Tìm kiếm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nhập từ khoá để tìm kiếm"
          icon={<MagnifyingGlassIcon className="h-5" />}
        />
        <ModeSelector mode={mode} setMode={setMode} />
        <StatusSelector preset="status" />
        <Switch
          label="Hiển thị dự án"
          checked={showProjectName}
          onChange={(event) => setShowProjectName(event.currentTarget.checked)}
        />
        <Switch
          label="Hiển thị mô tả"
          checked={showDescription}
          onChange={(event) => setShowDescription(event.currentTarget.checked)}
        />
        <Switch
          label="Hiển thị mức giảm tối đa"
          checked={showLimits}
          onChange={(event) => setShowLimits(event.currentTarget.checked)}
        />
        <Switch
          label="Hiển thị ngày bắt đầu"
          checked={showStartDate}
          onChange={(event) => setShowStartDate(event.currentTarget.checked)}
        />
        <Switch
          label="Hiển thị ngày kết thúc"
          checked={showEndDate}
          onChange={(event) => setShowEndDate(event.currentTarget.checked)}
        />
      </div>

      <Divider className="mt-4" />
      <div className="flex items-center justify-center py-4 text-center">
        <Pagination value={activePage} onChange={setPage} total={10} noWrap />
      </div>

      <div
        className={`grid gap-4 ${
          mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
        }`}
      >
        <PlusCardButton href="/inventory/promotions/new" />
        <PromotionCard
          href={`/${ws.id}/inventory/products/1`}
          name="Nvidia"
          value={63}
          isPercent={true}
          maxPerDay={100000}
          maxPerMonth={1000000}
          showDescription={showDescription}
          showLimits={showLimits}
          showStartDate={showStartDate}
          showEndDate={showEndDate}
        />
        <PromotionCard
          href={`/${ws.id}/inventory/products/1`}
          name="Nvidia"
          value={150000}
          showDescription={showDescription}
          showLimits={showLimits}
          showStartDate={showStartDate}
          showEndDate={showEndDate}
        />
        <PromotionCard
          href={`/${ws.id}/inventory/products/1`}
          name="Nvidia"
          value={20000}
          maxPerDay={100000}
          showDescription={showDescription}
          showLimits={showLimits}
          showStartDate={showStartDate}
          showEndDate={showEndDate}
        />
      </div>
    </div>
  );
}
