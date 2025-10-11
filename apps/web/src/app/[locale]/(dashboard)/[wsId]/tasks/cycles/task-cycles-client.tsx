'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Archive,
  Calendar,
  Edit3,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
  User,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';

type CycleStatus = 'planned' | 'active' | 'completed' | 'cancelled';

type TaskCycle = {
  id: string;
  name: string;
  description: string | null;
  status: CycleStatus | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  creator?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  tasksCount: number;
};

interface TaskCyclesClientProps {
  wsId: string;
  initialCycles: TaskCycle[];
}

const STATUS_LABELS: Record<CycleStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_BADGE_CLASS: Record<CycleStatus, string> = {
  planned: 'bg-dynamic-yellow/15 text-dynamic-yellow border-transparent',
  active: 'bg-dynamic-green/15 text-dynamic-green border-transparent',
  completed: 'bg-dynamic-blue/15 text-dynamic-blue border-transparent',
  cancelled: 'bg-dynamic-red/15 text-dynamic-red border-transparent',
};

function toISOorNull(value: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return trimmed;
}

export function TaskCyclesClient({
  wsId,
  initialCycles,
}: TaskCyclesClientProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<TaskCycle | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState<CycleStatus>('planned');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<CycleStatus>('planned');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [isNameAuto, setIsNameAuto] = useState(true);

  const statusOptions = useMemo(
    () =>
      (Object.keys(STATUS_LABELS) as CycleStatus[]).map((value) => ({
        value,
        label: STATUS_LABELS[value],
      })),
    []
  );

  const {
    data: cycles = initialCycles,
    isLoading,
    refetch,
  } = useQuery<TaskCycle[]>({
    queryKey: ['workspace', wsId, 'task-cycles'],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/task-cycles`);
      if (!response.ok) throw new Error('Failed to fetch cycles');
      return response.json();
    },
    initialData: initialCycles,
  });

  const createMutation = useMutation({
    mutationFn: async ({
      name,
      description,
      status,
      start_date,
      end_date,
    }: {
      name: string;
      description?: string;
      status: CycleStatus;
      start_date?: string | null;
      end_date?: string | null;
    }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/task-cycles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          status,
          start_date,
          end_date,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create cycle');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Cycle created');
      setIsCreateDialogOpen(false);
      setNewName('');
      setNewDescription('');
      setNewStatus('planned');
      setNewStartDate('');
      setNewEndDate('');
      refetch();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create cycle'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      description,
      status,
      start_date,
      end_date,
    }: {
      id: string;
      name: string;
      description?: string;
      status: CycleStatus;
      start_date?: string | null;
      end_date?: string | null;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-cycles/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description,
            status,
            start_date,
            end_date,
          }),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update cycle');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Cycle updated');
      setIsEditDialogOpen(false);
      setEditingCycle(null);
      setEditName('');
      setEditDescription('');
      setEditStatus('planned');
      setEditStartDate('');
      setEditEndDate('');
      refetch();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update cycle'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-cycles/${id}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete cycle');
      }
    },
    onSuccess: () => {
      toast.success('Cycle deleted');
      refetch();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete cycle'),
  });

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error('Cycle name is required');
      return;
    }
    createMutation.mutate({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      status: newStatus,
      start_date: toISOorNull(newStartDate),
      end_date: toISOorNull(newEndDate),
    });
  };

  // Helpers for date suggestions
  const formatYMD = useCallback((d: dayjs.Dayjs) => d.format('YYYY-MM-DD'), []);
  const mondayOfWeek = useCallback((d: dayjs.Dayjs) => {
    const dow = d.day(); // 0..6 (Sun..Sat)
    const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
    return d.add(diff, 'day').startOf('day');
  }, []);
  const sundayOfWeek = (d: dayjs.Dayjs) => mondayOfWeek(d).add(6, 'day');

  const suggestNameFromRange = useCallback(
    (start: string | null, end: string | null) => {
      if (!start || !end) return 'New Cycle';
      const s = dayjs(start);
      const e = dayjs(end);
      // Example: Sprint Oct 1 → Oct 14, 2025
      const sameMonth = s.month() === e.month() && s.year() === e.year();
      const startFmt = sameMonth ? s.format('MMM D') : s.format('MMM D');
      const endFmt = e.format('MMM D, YYYY');
      return `Sprint ${startFmt} → ${endFmt}`;
    },
    []
  );

  const setRange = useCallback(
    (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
      const s = formatYMD(start);
      const e = formatYMD(end);
      setNewStartDate(s);
      setNewEndDate(e);
      if (isNameAuto) setNewName(suggestNameFromRange(s, e));
    },
    [formatYMD, isNameAuto, suggestNameFromRange]
  );

  // Initialize defaults when opening create dialog
  useEffect(() => {
    if (isCreateDialogOpen) {
      const today = dayjs();
      // Default: next 2-week sprint starting next Monday
      const nextMonday = mondayOfWeek(
        today.add(7 - ((today.day() + 6) % 7), 'day')
      );
      const end = nextMonday.add(13, 'day');
      setRange(nextMonday, end);
      if (isNameAuto)
        setNewName(suggestNameFromRange(formatYMD(nextMonday), formatYMD(end)));
    }
  }, [
    isCreateDialogOpen,
    formatYMD,
    isNameAuto,
    mondayOfWeek,
    setRange,
    suggestNameFromRange,
  ]);

  // Keep suggested name in sync if user hasn't typed custom name
  useEffect(() => {
    if (isNameAuto) {
      setNewName(
        suggestNameFromRange(newStartDate || null, newEndDate || null)
      );
    }
  }, [newStartDate, newEndDate, isNameAuto, suggestNameFromRange]);

  const handleEdit = (cycle: TaskCycle) => {
    setEditingCycle(cycle);
    setEditName(cycle.name);
    setEditDescription(cycle.description || '');
    setEditStatus(cycle.status ?? 'planned');
    setEditStartDate(cycle.start_date || '');
    setEditEndDate(cycle.end_date || '');
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingCycle || !editName.trim()) {
      toast.error('Cycle name is required');
      return;
    }
    updateMutation.mutate({
      id: editingCycle.id,
      name: editName.trim(),
      description: editDescription.trim() || undefined,
      status: editStatus,
      start_date: toISOorNull(editStartDate),
      end_date: toISOorNull(editEndDate),
    });
  };

  const renderStatusBadge = (status: CycleStatus | null) => {
    const key = status ?? 'planned';
    return (
      <Badge className={STATUS_BADGE_CLASS[key]}>{STATUS_LABELS[key]}</Badge>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">All Cycles</h2>
          <p className="text-muted-foreground text-sm">
            {cycles.length} cycle{cycles.length === 1 ? '' : 's'} total
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Cycle
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-dynamic-purple" />
        </div>
      ) : cycles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Archive className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold text-lg">No cycles yet</h3>
            <p className="text-center text-muted-foreground">
              Create your first cycle to time-box work and plan sprints.
            </p>
            <Button
              className="mt-4"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Cycle
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cycles.map((cycle) => (
            <Card key={cycle.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-col gap-2">
                      <CardTitle className="text-base">{cycle.name}</CardTitle>
                      {renderStatusBadge(cycle.status)}
                    </div>
                    {cycle.description && (
                      <CardDescription>{cycle.description}</CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={
                          updateMutation.isPending || deleteMutation.isPending
                        }
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleEdit(cycle)}
                        disabled={updateMutation.isPending}
                      >
                        <Edit3 className="mr-2 h-4 w-4 text-dynamic-blue" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteMutation.mutate(cycle.id)}
                        disabled={deleteMutation.isPending}
                        className="text-dynamic-red focus:text-dynamic-red"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{cycle.creator?.display_name || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {cycle.start_date
                        ? new Date(cycle.start_date).toLocaleDateString()
                        : 'No start'}
                      {' – '}
                      {cycle.end_date
                        ? new Date(cycle.end_date).toLocaleDateString()
                        : 'No end'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Cycle</DialogTitle>
            <DialogDescription>
              Time-box work by defining start and end dates for the cycle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cycle-name" className="font-medium text-sm">
                Name
              </Label>
              <Input
                id="cycle-name"
                placeholder="Sprint 1"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setIsNameAuto(e.target.value.trim().length === 0);
                }}
                disabled={createMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="cycle-description"
                className="font-medium text-sm"
              >
                Description (Optional)
              </Label>
              <Textarea
                id="cycle-description"
                placeholder="Goals and scope"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                disabled={createMutation.isPending}
                className="min-h-[80px]"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="font-medium text-sm">Status</Label>
                <Select
                  value={newStatus}
                  onValueChange={(v: CycleStatus) => setNewStatus(v)}
                  disabled={createMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="start-date" className="font-medium text-sm">
                  Start (YYYY-MM-DD)
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  placeholder="2025-10-01"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  disabled={createMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date" className="font-medium text-sm">
                  End (YYYY-MM-DD)
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  placeholder="2025-10-14"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  disabled={createMutation.isPending}
                />
              </div>
            </div>

            {/* Quick range picks */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const start = mondayOfWeek(dayjs());
                  const end = sundayOfWeek(dayjs());
                  setRange(start, end);
                }}
                disabled={createMutation.isPending}
              >
                This week
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const start = mondayOfWeek(dayjs().add(7, 'day'));
                  const end = start.add(6, 'day');
                  setRange(start, end);
                }}
                disabled={createMutation.isPending}
              >
                Next week
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const start = mondayOfWeek(dayjs().add(7, 'day'));
                  const end = start.add(13, 'day');
                  setRange(start, end);
                }}
                disabled={createMutation.isPending}
              >
                2 weeks (next)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const start = dayjs();
                  const end = start.add(13, 'day');
                  setRange(start, end);
                }}
                disabled={createMutation.isPending}
              >
                14 days from today
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Cycle'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cycle</DialogTitle>
            <DialogDescription>
              Update details and schedule for this cycle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="font-medium text-sm">
                Name
              </Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description" className="font-medium text-sm">
                Description (Optional)
              </Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={updateMutation.isPending}
                className="min-h-[80px]"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="font-medium text-sm">Status</Label>
                <Select
                  value={editStatus}
                  onValueChange={(v: CycleStatus) => setEditStatus(v)}
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="edit-start-date"
                  className="font-medium text-sm"
                >
                  Start (YYYY-MM-DD)
                </Label>
                <Input
                  id="edit-start-date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  disabled={updateMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end-date" className="font-medium text-sm">
                  End (YYYY-MM-DD)
                </Label>
                <Input
                  id="edit-end-date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  disabled={updateMutation.isPending}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Cycle'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
