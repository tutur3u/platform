'use client';

import { useQuery } from '@tanstack/react-query';
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
  Calendar,
  Clock,
  FileText,
  Filter,
  Mic,
  Play,
  Plus,
  Search,
  Users,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { format } from 'date-fns';
import { useState } from 'react';

interface Meeting {
  id: string;
  name: string;
  time: string;
  created_at: string;
  creator_id: string;
  creator: {
    display_name: string;
  };
  recording_sessions: Array<{
    id: string;
    status:
      | 'recording'
      | 'interrupted'
      | 'pending_transcription'
      | 'transcribing'
      | 'completed'
      | 'failed';
    created_at: string;
    updated_at: string;
    recording_transcriptions?: {
      text: string;
      created_at: string;
    };
  }>;
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
  const [searchTerm, setSearchTerm] = useState(search);
  const [currentPage, setCurrentPage] = useState(page);

  const { data, isLoading, error } = useQuery({
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

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      recording: {
        variant: 'default' as const,
        label: 'Recording',
      },
      interrupted: {
        variant: 'destructive' as const,
        label: 'Interrupted',
      },
      pending_transcription: {
        variant: 'secondary' as const,
        label: 'Pending',
      },
      transcribing: {
        variant: 'secondary' as const,
        label: 'Transcribing',
      },
      completed: {
        variant: 'default' as const,
        label: 'Completed',
      },
      failed: {
        variant: 'destructive' as const,
        label: 'Failed',
      },
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] ||
      statusConfig.recording;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">Error loading data</p>
          <Button onClick={() => window.location.reload()}>Refresh</Button>
        </div>
      </div>
    );
  }

  return (
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
            <h3 className="mb-2 text-lg font-semibold">No meetings found</h3>
            <p className="mb-4 text-muted-foreground">
              Create your first meeting to get started with video conferencing
              and AI-powered features.
            </p>
            <Button>
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span>{meeting.creator.display_name}</span>
                </div>

                {/* Recording Sessions */}
                {meeting.recording_sessions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Recordings</h4>
                    {meeting.recording_sessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between rounded bg-muted/50 p-2"
                      >
                        <div className="flex items-center gap-2">
                          <Mic className="h-3 w-3" />
                          {getStatusBadge(session.status)}
                        </div>
                        {session.recording_transcriptions && (
                          <Button variant="ghost" size="sm">
                            <FileText className="mr-1 h-3 w-3" />
                            View Transcript
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" className="flex-1">
                    <Play className="mr-1 h-3 w-3" />
                    Join Meeting
                  </Button>
                  <Button variant="outline" size="sm">
                    Edit
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

          <span className="text-sm text-muted-foreground">
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
  );
}
