'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Loader2, Sparkles } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
// Extend dayjs with timezone and UTC plugins
dayjs.extend(utc);
dayjs.extend(timezone);

interface AutoScheduleComprehensiveDialogProps {
  wsId: string;
  children?: React.ReactNode;
}

export default function AutoScheduleComprehensiveDialog({
  wsId,
  children,
}: AutoScheduleComprehensiveDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRealtime, setIsRealtime] = useState(true);
  const [gapMinutes, setGapMinutes] = useState(0);
  const queryClient = useQueryClient();
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const router = useRouter();
  const stopRefreshing = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  };

  const handleAutoSchedule = async () => {
    if (isLoading) return;

    setIsLoading(true);
    toast.loading('Connecting to optimizer...', {
      id: 'auto-schedule',
    });

    if (isRealtime) {
      refreshIntervalRef.current = setInterval(() => {
        queryClient.invalidateQueries({
          queryKey: ['calendarEvents', wsId],
        });
      }, 500);
    }

    try {
      const userTimezone = dayjs.tz.guess();
      const apiUrl = `/api/${wsId}/calendar/auto-schedule?stream=${isRealtime}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gapMinutes,
          timezone: userTimezone,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: 'Failed to connect to the optimization service.',
        }));
        throw new Error(errorData.error);
      }

      if (isRealtime) {
        if (!response.body)
          throw new Error('Streaming response not available.');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Add a label to the while loop
        streamLoop: while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const json = JSON.parse(line.substring(6));

                toast.loading(json.message || 'Optimizing...', {
                  id: 'auto-schedule',
                });

                if (json.status === 'complete' || json.status === 'converged') {
                  toast.success(json.message || 'Optimization complete!', {
                    id: 'auto-schedule',
                    duration: 5000,
                  });
                  setIsOpen(false);
                  break streamLoop; 
                }
                if (json.status === 'error') {
                  throw new Error(json.message || 'An unknown error occurred');
                }
              } catch (e) {
                console.warn('Failed to parse stream chunk:', line, e);
              }
            }
          }
        }
      } else {
        const data = await response.json();
        toast.success(data.message || 'Optimization complete!', {
          id: 'auto-schedule',
          duration: 5000,
        });
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Auto-schedule error:', error);
      toast.error('Failed to optimize calendar', {
        id: 'auto-schedule',
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      router.refresh();
      setIsLoading(false);
      stopRefreshing();
      await queryClient.invalidateQueries({
        queryKey: ['calendarEvents', wsId],
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Auto-Schedule Settings</DialogTitle>
          <DialogDescription>
            Configure how the auto-scheduler optimizes your calendar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="realtime-updates">Real-time updates</Label>
            <Switch
              id="realtime-updates"
              checked={isRealtime}
              onCheckedChange={setIsRealtime}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label>Gap Between Events</Label>
            <Select
              value={String(gapMinutes)}
              onValueChange={(value) => setGapMinutes(Number(value))}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">No Gap</SelectItem>
                <SelectItem value="15">15-minute Gap</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleAutoSchedule}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {isLoading ? 'Optimizing...' : 'Run Auto-Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}