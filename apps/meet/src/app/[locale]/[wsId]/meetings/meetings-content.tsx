'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  ExternalLink,
  Play,
  Search,
  Trash2,
  Users,
} from '@tuturuuu/icons';
import {
  deleteWorkspaceMeeting,
  getWorkspaceMeetings,
  updateWorkspaceMeeting,
} from '@tuturuuu/internal-api';
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
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { MeetingEntry } from '@/features/call/components/meeting-entry';
import { normalizeMeetingTime } from '@/features/call/lib/meeting-time';
import { encodeRoomCode } from '@/features/call/lib/room-code';

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
  calendar_event?: {
    id: string;
    start_at: string;
    end_at: string;
    url: string;
  } | null;
}

interface MeetingsContentProps {
  canCreate: boolean;
  wsId: string;
  page: number;
  pageSize: number;
  search: string;
}

export function MeetingsContent({
  canCreate,
  wsId,
  page,
  pageSize,
  search,
}: MeetingsContentProps) {
  const router = useRouter();
  const t = useTranslations('meet.call');
  const meetingsT = useTranslations('meet.meetings');
  const [searchTerm, setSearchTerm] = useState(search);
  const [currentPage, setCurrentPage] = useState(page);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(
    null
  );
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const editNameRef = useRef<HTMLInputElement>(null);
  const editTimeRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['meetings', wsId, currentPage, pageSize, searchTerm],
    queryFn: () =>
      getWorkspaceMeetings<{
        meetings: Meeting[];
        totalCount: number;
      }>(wsId, {
        page: currentPage,
        pageSize,
        search: searchTerm,
      }),
  });

  const meetings: Meeting[] = data?.meetings || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

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
      await updateWorkspaceMeeting(wsId, editingMeeting.id, {
        name,
        time: normalizeMeetingTime(time),
      });
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
    setDeleting(true);
    try {
      await deleteWorkspaceMeeting(wsId, meetingId);
      setDeletingMeetingId(null);
      await refetch();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      toast.error('Failed to delete meeting.');
    } finally {
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
    router.push(`/r/${encodeRoomCode(meetingId)}`);
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
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Search meetings"
              className="pl-9"
              placeholder="Search meetings..."
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <MeetingEntry
            canCreate={canCreate}
            onCreated={() => void refetch()}
            wsId={wsId}
          />
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
              <p className="max-w-md text-muted-foreground">
                Your scheduled and recent meetings will appear here.
              </p>
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
                    <span>{meeting.creator?.display_name ?? t('guest')}</span>
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
                    {meeting.calendar_event && (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={meeting.calendar_event.url}
                          rel="noreferrer"
                          target="_blank"
                          title={meetingsT('open_calendar')}
                        >
                          <Calendar className="h-3 w-3" />
                          <span className="sr-only">
                            {meetingsT('open_calendar')}
                          </span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
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
                      onClick={() => setDeletingMeetingId(meeting.id)}
                      disabled={deleting}
                      className="text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red"
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
              <div className="text-dynamic-red text-sm">{editFormError}</div>
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

      <Dialog
        open={deletingMeetingId !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeletingMeetingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete meeting?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The meeting and its recordings will
              be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={deleting}
              onClick={() => setDeletingMeetingId(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleting || !deletingMeetingId}
              onClick={() => {
                if (deletingMeetingId) {
                  void handleDeleteMeeting(deletingMeetingId);
                }
              }}
              type="button"
              variant="destructive"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
