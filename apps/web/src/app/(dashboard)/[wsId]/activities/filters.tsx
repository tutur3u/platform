'use client';

import ModeSelector, { Mode } from '@/components/selectors/ModeSelector';
import OperationMultiSelector from '@/components/selectors/OperationMultiSelector';
import PaginationSelector from '@/components/selectors/PaginationSelector';
import WorkspaceMemberMultiSelector from '@/components/selectors/WorkspaceMemberMultiSelector';
import { useLocalStorage } from '@mantine/hooks';
import { useState } from 'react';

export default function Filters() {
  const [, setPage] = useState(1);

  const [ops, setOps] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'activities-items-per-page',
    defaultValue: 15,
  });

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'activities-mode',
    defaultValue: 'list',
  });

  return (
    <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
      <ModeSelector mode={mode} setMode={setMode} />
      <PaginationSelector
        items={itemsPerPage}
        setItems={(size) => {
          setPage(1);
          setItemsPerPage(size);
        }}
      />
      <OperationMultiSelector ops={ops} setOps={setOps} />
      <WorkspaceMemberMultiSelector userIds={userIds} setUserIds={setUserIds} />
    </div>
  );
}
