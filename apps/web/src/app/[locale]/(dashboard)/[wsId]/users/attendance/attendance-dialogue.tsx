import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/client';
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
import { format } from 'date-fns';
import { useLocale } from 'next-intl';
import React, { useEffect, useState } from 'react';

interface AttendanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  user: WorkspaceUser;
  wsId: string;
  groups: { id: string; name: string }[];
  onAttendanceUpdated: () => void;
  currentStatus: 'PRESENT' | 'ABSENT' | null;
  currentGroupId: string | null;
}

export function AttendanceDialog({
  isOpen,
  onClose,
  date,
  user,
  wsId,
  groups,
  onAttendanceUpdated,
  currentStatus,
  currentGroupId,
}: AttendanceDialogProps) {
  const locale = useLocale();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    currentGroupId
  );
  const [status, setStatus] = useState<'PRESENT' | 'ABSENT' | null>(
    currentStatus
  );
  const { toast } = useToast();

  useEffect(() => {
    setSelectedGroupId(currentGroupId);
    setStatus(currentStatus);
  }, [currentGroupId, currentStatus]);

  const handleSubmit = async () => {
    if (!selectedGroupId || !status) return;
    const supabase = await createClient();
    const { error } = await supabase
      .from('user_group_attendance')
      .upsert({
        ws_id: wsId,
        user_id: user.id,
        group_id: selectedGroupId,
        date: format(date, 'yyyy-mm-dd'),
        status,
      })
      .select();
    if (error) {
      console.error('Error updating attendance:', error);
      toast({
        title: 'Error updating attendance',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Attendance updated',
        description: 'The attendance record has been successfully updated.',
      });
      onAttendanceUpdated();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Attendance</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-right font-semibold">Name:</span>
            <span className="col-span-3">{user.full_name}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-right font-semibold">Date:</span>
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
            <span className="text-right font-semibold">Group:</span>
            <Select
              onValueChange={setSelectedGroupId}
              value={selectedGroupId || undefined}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-right font-semibold">Status:</span>
            <div className="col-span-3 flex gap-2">
              <Button
                variant={status === 'PRESENT' ? 'default' : 'outline'}
                onClick={() => setStatus('PRESENT')}
              >
                Present
              </Button>
              <Button
                variant={status === 'ABSENT' ? 'default' : 'outline'}
                onClick={() => setStatus('ABSENT')}
              >
                Absent
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!selectedGroupId || !status}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
