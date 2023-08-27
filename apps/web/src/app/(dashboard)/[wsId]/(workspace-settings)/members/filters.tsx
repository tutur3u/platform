'use client';

import MemberRoleMultiSelector from '@/components/selectors/MemberRoleMultiSelector';
import ModeSelector from '@/components/selectors/ModeSelector';
import PaginationSelector, {
  Mode,
} from '@/components/selectors/PaginationSelector';
import { useLocalStorage } from '@mantine/hooks';
import { useState } from 'react';

export default function Filters() {
  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'ws-members-items-per-page',
    defaultValue: 15,
  });

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'members-mode',
    defaultValue: 'grid',
  });

  const [roles, setRoles] = useState<string[]>([]);

  return (
    <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
      <ModeSelector mode={mode} setMode={setMode} showAll />
      <PaginationSelector items={itemsPerPage} setItems={setItemsPerPage} />
      <MemberRoleMultiSelector roles={roles} setRoles={setRoles} />
    </div>
  );
}
