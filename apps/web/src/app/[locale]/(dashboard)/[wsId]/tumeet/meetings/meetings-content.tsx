'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  Filter,
  Play,
  Plus,
  Search,
  Trash2,
  Users,
} from '@tuturuuu/icons';
import type { RecordingStatus } from '@tuturuuu/types';
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface Meeting {
  id: string;
  name: string;
  time: string;
  created_at: string;
  creator_id: string;
  creator: {
    display_name: string;
  };
  recording_sessions: {
    id: string;
    status: RecordingStatus;
    created_at: string;
    updated_at: string;
  }[];
}

interface MeetingsContentProps {
  wsId: string;
  page: number;
  pageSize: number;
  search: string;
}

export function MeetingsContent({
  wsId,
  page,
  pageSize,
  search,
}: MeetingsContentProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState(search);
  const [currentPage, setCurrentPage] = useState(page);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const editNameRef = useRef<HTMLInputElement>(null);
  const editTimeRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['meetings', wsId, currentPage, pageSize, searchTerm],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/meetings?page=${currentPage}&pageSize=${pageSize}&search=${searchTerm}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch meetings');
      }
      return response.json();
    },
  });

  const meetings: Meeting[] = data?.meetings || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    const name = nameRef.current?.value.trim();
    let time = timeRef.current?.value;
    if (!name) {
      setFormError('Name is required.');
      setCreating(false);
      return;
    }
    if (!time) {
      time = new Date().toISOString();
    }
    try {
      const res = await fetch(`/api/v1/workspaces/${wsId}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, time }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || 'Failed to create meeting.');
        setCreating(false);
        return;
      }
      setDialogOpen(false);
      setCreating(false);
      setFormError(null);
      refetch();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      setFormError('Failed to create meeting.');
      setCreating(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMeeting) return;

    setEditFormError(null);
    setEditing(true);
    const name = editNameRef.current?.value.trim();
    let time = editTimeRef.current?.value;
    if (!name) {
      setEditFormError('Name is required.');
      setEditing(false);
      return;
    }
    if (!time) {
      time = new Date().toISOString();
    }
    try {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${editingMeeting.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, time }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditFormError(data.error || 'Failed to update meeting.');
        setEditing(false);
        return;
      }
      setEditDialogOpen(false);
      setEditing(false);
      setEditFormError(null);
      setEditingMeeting(null);
      refetch();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      setEditFormError('Failed to update meeting.');
      setEditing(false);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (
      !window.confirm(
        'Are you sure you want to delete this meeting? This action cannot be undone.'
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}`,
        {
          method: 'DELETE',
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete meeting.');
        setDeleting(false);
        return;
      }

      refetch();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      alert('Failed to delete meeting.');
      setDeleting(false);
    }
  };

  const openEditDialog = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setEditDialogOpen(true);
  };

  useEffect(() => {
    if (
      editDialogOpen &&
      editingMeeting &&
      editNameRef.current &&
      editTimeRef.current
    ) {
      editNameRef.current.value = editingMeeting.name;
      const meetingTime = new Date(editingMeeting.time);
      const localTime = new Date(
        meetingTime.getTime() - meetingTime.getTimezoneOffset() * 60000
      );
      editTimeRef.current.value = localTime.toISOString().slice(0, 16);
    }
  }, [editDialogOpen, editingMeeting]);

  const handleJoinMeeting = (meetingId: string) => {
    router.push(`/${wsId}/tumeet/meetings/${meetingId}`);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">Error loading data</p>
          <Button onClick={() => refetch()}>Refresh</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Search and Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <form
            onSubmit={handleSearch}
            className="flex w-full max-w-sm items-center space-x-2"
          >
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search meetings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button type="submit" size="sm">
              Search
            </Button>
          </form>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
          </div>
        </div>

        {/* Meetings Grid */}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="mb-2 h-3 w-full rounded bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 font-semibold text-lg">No meetings found</h3>
              <p className="mb-4 text-muted-foreground">
                Create your first meeting to get started with video conferencing
                and AI-powered features.
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Meeting
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {meetings.map((meeting) => (
              <Card
                key={meeting.id}
                className="transition-shadow hover:shadow-md"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="line-clamp-2 text-lg">
                        {meeting.name}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-3 w-3" />
                          {format(new Date(meeting.time), 'PPP p')}
                        </div>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Creator Info */}
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Users className="h-3 w-3" />
                    <span>{meeting.creator.display_name}</span>
                  </div>

                  {/* Recording Sessions */}
                  {meeting.recording_sessions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {meeting.recording_sessions.length} recordings
                      </Badge>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleJoinMeeting(meeting.id)}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      Join Meeting
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(meeting)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteMeeting(meeting.id)}
                      disabled={deleting}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>

            <span className="text-muted-foreground text-sm">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Create Meeting Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            className="flex items-center gap-2"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Meeting</DialogTitle>
            <DialogDescription>Enter meeting details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meeting-name">Name</Label>
              <Input
                id="meeting-name"
                ref={nameRef}
                required
                placeholder="Meeting name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-time">Time</Label>
              <Input
                id="meeting-time"
                ref={timeRef}
                type="datetime-local"
                placeholder="Leave blank for now"
              />
            </div>
            {formError && (
              <div className="text-red-600 text-sm">{formError}</div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? 'Creating...' : 'Create'}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="w-full">
                  Cancel
                </Button>
              </DialogClose>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Meeting Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Meeting</DialogTitle>
            <DialogDescription>Update meeting details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-meeting-name">Name</Label>
              <Input
                id="edit-meeting-name"
                ref={editNameRef}
                required
                placeholder="Meeting name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-meeting-time">Time</Label>
              <Input
                id="edit-meeting-time"
                ref={editTimeRef}
                type="datetime-local"
                placeholder="Leave blank for now"
              />
            </div>
            {editFormError && (
              <div className="text-red-600 text-sm">{editFormError}</div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={editing} className="w-full">
                {editing ? 'Updating...' : 'Update'}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="w-full">
                  Cancel
                </Button>
              </DialogClose>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
