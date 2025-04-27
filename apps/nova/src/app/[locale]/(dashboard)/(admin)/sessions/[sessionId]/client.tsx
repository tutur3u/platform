'use client';

import { SessionData } from './types';
import { calculateDuration } from './utils/date-helper';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  Send,
  User,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useRouter } from 'next/navigation';

interface SessionClientProps {
  session: SessionData;
}

export default function SessionClient({ session }: SessionClientProps) {
  const router = useRouter();

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get session duration
  const getDuration = () => {
    if (!session.endTime) {
      return 'In progress';
    }

    return calculateDuration(
      new Date(session.startTime),
      new Date(session.endTime)
    );
  };

  // Render session status badge
  const renderStatusBadge = (status: string) => {
    let className = '';

    switch (status.toLowerCase()) {
      case 'in_progress':
        className = 'bg-green-100 text-green-800';
        break;
      case 'ended':
        className = 'bg-blue-100 text-blue-800';
        break;
      default:
        className = 'bg-gray-100 text-gray-800';
    }

    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      >
        {status}
      </span>
    );
  };

  // Format score as percentage
  const formatScore = (score: number) => {
    return `${score.toFixed(1)}/10`;
  };

  // Render score badge
  const renderScoreBadge = (score: number) => {
    let className = '';

    if (score >= 8) {
      className = 'bg-green-100 text-green-800';
    } else if (score >= 6) {
      className = 'bg-blue-100 text-blue-800';
    } else if (score >= 4) {
      className = 'bg-yellow-100 text-yellow-800';
    } else {
      className = 'bg-red-100 text-red-800';
    }

    return (
      <Badge variant="outline" className={className}>
        {formatScore(score)}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center">
        <Button
          variant="outline"
          size="sm"
          className="mr-4"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">Session Details</h1>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="submissions">
            Submissions ({session.submissions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Left column - User info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  User Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={session.user.avatarUrl} />
                    <AvatarFallback className="text-lg">
                      {session.user.displayName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="mt-4 text-xl font-semibold">
                    {session.user.displayName}
                  </h3>
                  {session.user.email && (
                    <p className="text-muted-foreground text-sm">
                      {session.user.email}
                    </p>
                  )}
                </div>

                <Separator className="my-4" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">
                      User ID:
                    </span>
                    <span className="font-mono text-xs">{session.user.id}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-center">
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a
                    href={`mailto:${session.user.email}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Contact User
                  </a>
                </Button>
              </CardFooter>
            </Card>

            {/* Middle column - Session details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="mr-2 h-4 w-4" />
                  Session Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium">Status</h3>
                    <div className="mt-1">
                      {renderStatusBadge(session.status)}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium">Duration</h3>
                    <p className="mt-1">{getDuration()}</p>
                  </div>

                  <div>
                    <h3 className="font-medium">Started At</h3>
                    <p className="mt-1">{formatDate(session.startTime)}</p>
                  </div>

                  <div>
                    <h3 className="font-medium">Ended At</h3>
                    <p className="mt-1">{formatDate(session.endTime)}</p>
                  </div>

                  <div>
                    <h3 className="font-medium">Created At</h3>
                    <p className="mt-1">{formatDate(session.createdAt)}</p>
                  </div>

                  <div>
                    <h3 className="font-medium">Session ID</h3>
                    <p className="font-mono text-xs">{session.id}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Right column - Challenge info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="mr-2 h-4 w-4" />
                  Challenge Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium">Challenge</h3>
                    <p className="mt-1 text-lg font-semibold">
                      {session.challenge.title}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium">Description</h3>
                    <p className="mt-1 text-sm">
                      {session.challenge.description ||
                        'No description available'}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium">Challenge ID</h3>
                    <p className="font-mono text-xs">{session.challenge.id}</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    router.push(`/challenges/${session.challenge.id}`)
                  }
                >
                  View Challenge
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="submissions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-4 w-4" />
                Submissions During Session
              </CardTitle>
            </CardHeader>
            <CardContent>
              {session.submissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="h-12 w-12 text-gray-300" />
                  <h3 className="mt-4 text-lg font-medium">
                    No submissions found
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm">
                    There are no submissions recorded during this session.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">ID</TableHead>
                      <TableHead>Problem</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {session.submissions.map((submission) => (
                      <TableRow key={submission.id}>
                        <TableCell className="font-mono text-xs">
                          {submission.id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>{submission.problemTitle}</TableCell>
                        <TableCell>
                          {renderScoreBadge(submission.score)}
                        </TableCell>
                        <TableCell>
                          {formatDate(submission.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(`/submissions/${submission.id}`)
                            }
                          >
                            <ExternalLink className="h-4 w-4" />
                            <span className="sr-only">View</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
