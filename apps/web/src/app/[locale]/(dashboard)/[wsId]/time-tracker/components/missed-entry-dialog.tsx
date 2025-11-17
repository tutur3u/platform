import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@tuturuuu/ui/dialog";
import { Label } from "@tuturuuu/ui/label";
import { Input } from "@tuturuuu/ui/input";
import { Textarea } from "@tuturuuu/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tuturuuu/ui/select";
import { Button } from "@tuturuuu/ui/button";
import { RefreshCw, Plus, Clock } from "@tuturuuu/icons";
import dayjs from "dayjs";
import { cn } from "@tuturuuu/utils/format";
import { toast } from "@tuturuuu/ui/sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TimeTrackingCategory, WorkspaceTask } from "@tuturuuu/types";
import { formatDuration, getCategoryColor } from "./session-history";

interface MissedEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TimeTrackingCategory[] | null;
  tasks: (Partial<WorkspaceTask> & {
    board_name?: string;
    list_name?: string;
  })[] | null;
  wsId: string;
}

export default function MissedEntryDialog({ 
  open,
  onOpenChange,
  categories, 
  tasks,
  wsId,
}: MissedEntryDialogProps) {
  const router = useRouter();

  // State for missed entry form
  const [missedEntryTitle, setMissedEntryTitle] = useState('');
  const [missedEntryDescription, setMissedEntryDescription] = useState('');
  const [missedEntryCategoryId, setMissedEntryCategoryId] = useState('none');
  const [missedEntryTaskId, setMissedEntryTaskId] = useState('none');
  const [missedEntryStartTime, setMissedEntryStartTime] = useState('');
  const [missedEntryEndTime, setMissedEntryEndTime] = useState('');
  const [isCreatingMissedEntry, setIsCreatingMissedEntry] = useState(false);

  const closeMissedEntryDialog = () => {
    onOpenChange(false);
    setMissedEntryTitle('');
    setMissedEntryDescription('');
    setMissedEntryCategoryId('none');
    setMissedEntryTaskId('none');
    setMissedEntryStartTime('');
    setMissedEntryEndTime('');
  };

  const createMissedEntry = async () => {
    if (!missedEntryTitle.trim()) {
      toast.error('Please enter a title for the session');
      return;
    }

    if (!missedEntryStartTime || !missedEntryEndTime) {
      toast.error('Please enter both start and end times');
      return;
    }

    const startTime = dayjs(missedEntryStartTime);
    const endTime = dayjs(missedEntryEndTime);

    if (endTime.isBefore(startTime)) {
      toast.error('End time cannot be before start time');
      return;
    }

    if (endTime.diff(startTime, 'minutes') < 1) {
      toast.error('Session must be at least 1 minute long');
      return;
    }

    setIsCreatingMissedEntry(true);

    try {
      const userTz = dayjs.tz.guess();
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: missedEntryTitle,
            description: missedEntryDescription || null,
            categoryId:
              missedEntryCategoryId === 'none' ? null : missedEntryCategoryId,
            taskId: missedEntryTaskId === 'none' ? null : missedEntryTaskId,
            startTime: dayjs
              .tz(missedEntryStartTime, userTz)
              .utc()
              .toISOString(),
            endTime: dayjs.tz(missedEntryEndTime, userTz).utc().toISOString(),
            isManualEntry: true, // Flag to indicate this is a manually created entry
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create session');
      }

      router.refresh();
      closeMissedEntryDialog();
      toast.success('Missed entry added successfully');
    } catch (error) {
      console.error('Error creating missed entry:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create session';
      toast.error(errorMessage);
    } finally {
      setIsCreatingMissedEntry(false);
    }
  };
    return (
        <Dialog
        open={open}
        onOpenChange={closeMissedEntryDialog}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Missed Time Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="missed-entry-title">Title *</Label>
              <Input
                id="missed-entry-title"
                value={missedEntryTitle}
                onChange={(e) => setMissedEntryTitle(e.target.value)}
                placeholder="What were you working on?"
              />
            </div>
            <div>
              <Label htmlFor="missed-entry-description">Description</Label>
              <Textarea
                id="missed-entry-description"
                value={missedEntryDescription}
                onChange={(e) => setMissedEntryDescription(e.target.value)}
                placeholder="Optional details about the work"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="missed-entry-category">Category</Label>
                <Select
                  value={missedEntryCategoryId}
                  onValueChange={setMissedEntryCategoryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories?.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-3 w-3 rounded-full',
                              getCategoryColor(category.color || 'BLUE')
                            )}
                          />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="missed-entry-task">Task</Label>
                <Select
                  value={missedEntryTaskId}
                  onValueChange={setMissedEntryTaskId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select task" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No task</SelectItem>
                    {tasks?.map(
                      (task) =>
                        task.id && (
                          <SelectItem key={task.id} value={task.id}>
                            {task.name}
                          </SelectItem>
                        )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="missed-entry-start-time">Start Time *</Label>
                <Input
                  id="missed-entry-start-time"
                  type="datetime-local"
                  value={missedEntryStartTime}
                  onChange={(e) => setMissedEntryStartTime(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="missed-entry-end-time">End Time *</Label>
                <Input
                  id="missed-entry-end-time"
                  type="datetime-local"
                  value={missedEntryEndTime}
                  onChange={(e) => setMissedEntryEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Quick time presets */}
            <div className="rounded-lg border p-3">
              <Label className="text-muted-foreground text-xs">
                Quick Presets
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: 'Last hour', minutes: 60 },
                  { label: 'Last 2 hours', minutes: 120 },
                  {
                    label: 'Morning (9-12)',
                    isCustom: true,
                    start: '09:00',
                    end: '12:00',
                  },
                  {
                    label: 'Afternoon (13-17)',
                    isCustom: true,
                    start: '13:00',
                    end: '17:00',
                  },
                  {
                    label: 'Yesterday',
                    isCustom: true,
                    start: 'yesterday-9',
                    end: 'yesterday-17',
                  },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    type="button"
                    onClick={() => {
                      const now = dayjs();
                      if (preset.isCustom) {
                        if (preset.start === 'yesterday-9') {
                          const yesterday = now.subtract(1, 'day');
                          setMissedEntryStartTime(
                            yesterday
                              .hour(9)
                              .minute(0)
                              .format('YYYY-MM-DDTHH:mm')
                          );
                          setMissedEntryEndTime(
                            yesterday
                              .hour(17)
                              .minute(0)
                              .format('YYYY-MM-DDTHH:mm')
                          );
                        } else if (preset.start && preset.end) {
                          const today = now.startOf('day');
                          const startParts = preset.start.split(':');
                          const endParts = preset.end.split(':');
                          const startHour = parseInt(startParts[0] || '9', 10);
                          const startMin = parseInt(startParts[1] || '0', 10);
                          const endHour = parseInt(endParts[0] || '17', 10);
                          const endMin = parseInt(endParts[1] || '0', 10);
                          setMissedEntryStartTime(
                            today
                              .hour(startHour)
                              .minute(startMin)
                              .format('YYYY-MM-DDTHH:mm')
                          );
                          setMissedEntryEndTime(
                            today
                              .hour(endHour)
                              .minute(endMin)
                              .format('YYYY-MM-DDTHH:mm')
                          );
                        }
                      } else if (preset.minutes) {
                        const endTime = now;
                        const startTime = endTime.subtract(
                          preset.minutes,
                          'minutes'
                        );
                        setMissedEntryStartTime(
                          startTime.format('YYYY-MM-DDTHH:mm')
                        );
                        setMissedEntryEndTime(
                          endTime.format('YYYY-MM-DDTHH:mm')
                        );
                      }
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Show calculated duration */}
            {missedEntryStartTime && missedEntryEndTime && (
              <div className="rounded-lg bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Clock className="h-4 w-4" />
                  <span>Duration: </span>
                  <span className="font-medium text-foreground">
                    {(() => {
                      const start = dayjs(missedEntryStartTime);
                      const end = dayjs(missedEntryEndTime);
                      if (end.isBefore(start)) return 'Invalid time range';
                      const durationMs = end.diff(start);
                      const duration = Math.floor(durationMs / 1000);
                      return formatDuration(duration);
                    })()}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={closeMissedEntryDialog}
                className="flex-1"
                disabled={isCreatingMissedEntry}
              >
                Cancel
              </Button>
              <Button
                onClick={createMissedEntry}
                disabled={
                  isCreatingMissedEntry ||
                  !missedEntryTitle.trim() ||
                  !missedEntryStartTime ||
                  !missedEntryEndTime
                }
                className="flex-1"
              >
                {isCreatingMissedEntry ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add Entry
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
}