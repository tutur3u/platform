import { useQuery } from '@tanstack/react-query';
import { listWorkspaceUserGroups } from '@tuturuuu/internal-api/user-groups';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { format } from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface AttendanceDialogProps {
  wsId: string;
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  user: WorkspaceUser;
  onAttendanceUpdated: () => void;
  currentStatus: 'PRESENT' | 'ABSENT' | null;
}

export function AttendanceDialog({
  wsId,
  isOpen,
  onClose,
  date,
  user,
  onAttendanceUpdated,
  currentStatus,
}: AttendanceDialogProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [loading, setLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>();
  const [status, setStatus] = useState<'PRESENT' | 'ABSENT' | null>(
    currentStatus
  );

  const groupsQuery = useQuery({
    queryKey: ['workspaces', wsId, 'users', user.id, 'groups'],
    queryFn: async (): Promise<{
      data: Array<{ id: string; name: string | null }>;
      count: number;
    }> => listWorkspaceUserGroups(wsId, { userId: user.id }),
  });

  const { toast } = useToast();

  useEffect(() => {
    setSelectedGroupId(groupsQuery?.data?.data?.[0]?.id);
    setStatus(currentStatus);
  }, [groupsQuery?.data?.data, currentStatus]);

  const handleSubmit = async () => {
    setLoading(true);

    if (!selectedGroupId) {
      setLoading(false);
      return;
    }

    const dateStr = format(date, 'yyyy-MM-dd');

    const res = await fetch(
      `/api/v1/workspaces/${wsId}/user-groups/${selectedGroupId}/attendance`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            user_id: user.id,
            status: status || 'NONE',
            date: dateStr,
          },
        ]),
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      console.error('Error updating attendance:', errorData);
      toast({
        title: t('ws-user-attendance.update_error'),
        description: errorData.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: t('ws-user-attendance.update_success'),
      });
    }

    onAttendanceUpdated();
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('workspace-users-tabs.attendance')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-right font-semibold">
              {t('ws-users.display_name')}:
            </span>
            <span className="col-span-3">
              {user?.display_name || user?.full_name || user?.email || '-'}
            </span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-right font-semibold">
              {t('common.date')}:
            </span>
            <span className="col-span-3">
              {date.toLocaleDateString(locale, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-right font-semibold">
              {t('post-email-data-table.group_name')}:
            </span>
            <Select
              onValueChange={setSelectedGroupId}
              value={selectedGroupId || groupsQuery.data?.data?.[0]?.id}
              disabled={loading || !groupsQuery.data?.data?.length}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue
                  placeholder={
                    groupsQuery.data?.data?.length
                      ? t('ws-user-attendance.select_group')
                      : t('ws-user-attendance.no_groups')
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {groupsQuery.data?.data?.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-right font-semibold">
              {t('common.status')}:
            </span>
            <div className="col-span-3 flex gap-2">
              <Button
                variant={status === 'PRESENT' ? 'default' : 'outline'}
                onClick={() => setStatus('PRESENT')}
                disabled={loading || !groupsQuery.data?.data?.length}
              >
                {t('ws-user-attendance.present')}
              </Button>
              <Button
                variant={status === 'ABSENT' ? 'default' : 'outline'}
                onClick={() => setStatus('ABSENT')}
                disabled={loading || !groupsQuery.data?.data?.length}
              >
                {t('ws-user-attendance.absent')}
              </Button>
              <Button
                variant={status === null ? 'default' : 'outline'}
                onClick={() => setStatus(null)}
                disabled={loading || !groupsQuery.data?.data?.length}
              >
                {t('ws-user-attendance.not-set')}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!selectedGroupId}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
