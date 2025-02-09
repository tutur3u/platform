import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { useToast } from '@repo/ui/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tutur3u/supabase/next/client';
import { WorkspaceUser } from '@tutur3u/types/primitives/WorkspaceUser';
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
    queryFn: () => getGroupData({ wsId, userId: user.id }),
  });

  const { toast } = useToast();

  useEffect(() => {
    setSelectedGroupId(groupsQuery?.data?.data?.[0]?.id);
    setStatus(currentStatus);
  }, [groupsQuery?.data?.data, currentStatus]);

  const handleSubmit = async () => {
    setLoading(true);

    const supabase = createClient();
    if (!selectedGroupId) {
      setLoading(false);
      return;
    }

    if (status) {
      const { error } = await supabase
        .from('user_group_attendance')
        .upsert({
          user_id: user.id,
          group_id: selectedGroupId,
          date: format(date, 'yyyy-MM-dd'),
          status,
        })
        .select();

      if (error) {
        console.error('Error updating attendance:', error);
        toast({
          title: t('ws-user-attendance.update_error'),
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('ws-user-attendance.update_success'),
        });
      }
    } else {
      // Remove the attendance record
      const { error } = await supabase
        .from('user_group_attendance')
        .delete()
        .match({
          user_id: user.id,
          group_id: selectedGroupId,
          date: format(date, 'yyyy-MM-dd'),
        });

      if (error) {
        console.error('Error removing attendance:', error);
        toast({
          title: t('ws-user-attendance.update_error'),
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('ws-user-attendance.update_success'),
        });
      }
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

async function getGroupData({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups')
    .select('*, workspace_user_groups_users!inner(user_id)', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .eq('workspace_user_groups_users.user_id', userId);

  const { data, count, error } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}
