'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  RefreshCcw,
  Target,
  Trophy,
  XCircle,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  fetchAllProblems,
  fetchSessionDetails,
  type SessionDetails,
} from './actions';
import ProblemCard from './components/ProblemCard';
import SessionCard from './components/SessionCard';

// Maximum score constant - each problem is worth 10 points
const MAX_SCORE_PER_PROBLEM = 10;

interface SessionSummary {
  id: string;
  created_at: string;
  updated_at?: string;
  end_time: string | null;
}

interface Stats {
  score: number;
  maxScore: number;
  percentage: number;
  problemsAttempted: number;
  totalProblems: number;
}

interface Problem {
  id: string;
  title: string;
  description?: string;
  submissions: Array<{
    id: string;
    score: number;
    created_at: string;
    status: string;
  }>;
}

interface Challenge {
  id: string;
  title: string;
  description?: string;
}

interface Props {
  challengeId: string;
  challenge: Challenge;
  sessionSummaries: SessionSummary[];
  stats: Stats;
  userId: string;
  wsId: string;
}

// Skeleton component for session loading
const SessionDetailsSkeleton = () => (
  <div className="animate-pulse">
    <div className="mb-4 rounded-lg bg-muted p-4">
      <div className="mb-3 h-5 w-32 rounded bg-muted-foreground/20"></div>
      <div className="mb-2 h-4 w-48 rounded bg-muted-foreground/20"></div>
      <div className="h-4 w-44 rounded bg-muted-foreground/20"></div>
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array(2)
        .fill(0)
        .map((_, i) => (
          <div key={i} className="h-40 rounded-lg border p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-muted-foreground/20"></div>
                <div className="h-5 w-20 rounded bg-muted-foreground/20"></div>
              </div>
              <div className="h-5 w-14 rounded-full bg-muted-foreground/20"></div>
            </div>
            <div className="mb-2 h-4 w-3/4 rounded bg-muted-foreground/20"></div>
            <div className="mb-6 h-4 w-1/2 rounded bg-muted-foreground/20"></div>
            <div className="h-14 rounded bg-muted-foreground/20"></div>
          </div>
        ))}
    </div>
  </div>
);

export default function ResultClient({
  challengeId,
  challenge,
  sessionSummaries,
  stats,
  userId,
  wsId,
}: Props) {
  const router = useRouter();
  const [expandedSessions, setExpandedSessions] = useState<string[]>([]);
  const [loadedSessions, setLoadedSessions] = useState<
    Record<string, SessionDetails>
  >({});
  const [loadingSessions, setLoadingSessions] = useState<
    Record<string, boolean>
  >({});
  const [activeTab, setActiveTab] = useState('sessions');
  const [loadingAllProblems, setLoadingAllProblems] = useState(false);
  const [allProblems, setAllProblems] = useState<Problem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);

  // Get status text and color based on percentage
  const getChallengeStatus = (percentage: number) => {
    if (percentage >= 90) return { text: 'Excellent', color: 'text-green-600' };
    if (percentage >= 75) return { text: 'Great Job', color: 'text-green-500' };
    if (percentage >= 60)
      return { text: 'Good Progress', color: 'text-yellow-600' };
    if (percentage >= 40)
      return { text: 'Keep Going', color: 'text-orange-500' };
    return { text: 'Just Started', color: 'text-red-500' };
  };

  const status = getChallengeStatus(stats.percentage);

  // Load session data when an accordion item is expanded
  const handleAccordionValueChange = async (value: string[]) => {
    // Find which session was just expanded
    const newlyExpanded = value.find((id) => !expandedSessions.includes(id));

    if (
      newlyExpanded &&
      !loadedSessions[newlyExpanded] &&
      !loadingSessions[newlyExpanded]
    ) {
      // Start loading the session
      setLoadingSessions((prev) => ({ ...prev, [newlyExpanded]: true }));
      setError(null);

      try {
        const sessionData = await fetchSessionDetails(
          newlyExpanded,
          challengeId
        );

        setLoadedSessions((prev) => ({
          ...prev,
          [newlyExpanded]: sessionData,
        }));
      } catch (error) {
        console.error('Error loading session:', error);
        setError('Failed to load session details. Please try again later.');
      } finally {
        setLoadingSessions((prev) => ({ ...prev, [newlyExpanded]: false }));
      }
    }

    setExpandedSessions(value);
  };

  const handleTabChange = async (value: string) => {
    setActiveTab(value);
    setError(null);

    // If switching to problems tab and we haven't loaded them yet
    if (value === 'problems' && !allProblems && !loadingAllProblems) {
      setLoadingAllProblems(true);
      try {
        const result = await fetchAllProblems(challengeId, userId);
        setAllProblems(result.problems);
      } catch (error) {
        console.error('Error loading all problems:', error);
        setError('Failed to load problem details. Please try again later.');
      } finally {
        setLoadingAllProblems(false);
      }
    }
  };

  const refreshProblemDetails = async () => {
    if (activeTab === 'problems') {
      setLoadingAllProblems(true);
      setError(null);

      try {
        const result = await fetchAllProblems(challengeId, userId);
        setAllProblems(result.problems);
      } catch (error) {
        console.error('Error refreshing problems:', error);
        setError('Failed to refresh problem data. Please try again later.');
      } finally {
        setLoadingAllProblems(false);
      }
    }
  };

  const refreshPageData = () => {
    window.location.reload();
  };

  // Check if stats look valid
  const isValidScore =
    stats.score >= 0 &&
    stats.maxScore > 0 &&
    stats.percentage >= 0 &&
    stats.percentage <= 100;

  // If scores don't look valid, show an error
  useEffect(() => {
    if (!isValidScore && !error) {
      setError(
        'Some score calculations appear to be incorrect. This may be due to a temporary issue with our scoring system.'
      );
    }
  }, [error, isValidScore]);

  return (
    <div className="min-h-screen from-background to-muted/20 px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="mb-4 flex items-center gap-4 md:mb-0">
            <Button
              onClick={() => router.push(`/${wsId}/challenges`)}
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full shadow-sm"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{challenge.title}</h1>
              <p className="mt-1 text-muted-foreground">
                {challenge.description || 'Challenge Results'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => router.push(`/${wsId}/challenges/${challengeId}`)}
            variant="outline"
            className="gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            <span>Retry Challenge</span>
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-red-700">
            <div className="flex items-center">
              <div className="shrink-0">
                <XCircle className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Error loading data
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                  <p className="mt-1">
                    This could be due to a temporary issue with score
                    calculation. Try refreshing the page or click the refresh
                    button.
                  </p>
                </div>
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={refreshPageData}
                    className="border-red-300 text-red-800 hover:bg-red-50"
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Refresh Page
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {sessionSummaries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Card className="max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <BookOpen className="h-10 w-10" />
                </div>
                <CardTitle>No data available</CardTitle>
                <CardDescription>
                  We couldn't find any results for this challenge.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex justify-center">
                <Button
                  onClick={() => router.push(`/${wsId}/challenges`)}
                  className="w-full"
                >
                  Back to Challenges
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : (
          <>
            <Card className="mb-8 overflow-hidden border">
              <CardContent className="p-6">
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="col-span-2 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">
                          Overall Performance
                        </h3>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="flex cursor-pointer items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                                onClick={() =>
                                  setShowScoreBreakdown(!showScoreBreakdown)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setShowScoreBreakdown(!showScoreBreakdown);
                                  }
                                }}
                              >
                                <Trophy className="mr-1 h-4 w-4" />
                                {stats.score.toFixed(1)}/{stats.maxScore}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="w-[250px] p-3">
                              <p className="mb-1 text-xs font-medium">
                                Score Calculation Explanation:
                              </p>
                              <ul className="space-y-1 text-xs">
                                <li>
                                  • Each problem is worth{' '}
                                  {MAX_SCORE_PER_PROBLEM} points maximum
                                </li>
                                <li>
                                  • Your score is the sum of your best attempt
                                  for each problem
                                </li>
                                <li>
                                  • Tests and criteria are weighted equally when
                                  both exist
                                </li>
                                <li>• Click to see detailed breakdown</li>
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Progress
                        value={stats.percentage}
                        className="h-2"
                        indicatorClassName={
                          stats.percentage >= 80
                            ? 'bg-green-500'
                            : stats.percentage >= 60
                              ? 'bg-yellow-500'
                              : stats.percentage >= 40
                                ? 'bg-orange-500'
                                : 'bg-red-500'
                        }
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          You've attempted {stats.problemsAttempted || 0} out of{' '}
                          {stats.totalProblems || 0} problems
                        </p>
                        <p className={`text-sm font-medium ${status.color}`}>
                          {status.text}
                        </p>
                      </div>

                      {showScoreBreakdown && (
                        <div className="mt-4 rounded-lg bg-muted/30 p-3 text-sm">
                          <h4 className="mb-2 font-medium">Score Breakdown</h4>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-muted-foreground">
                                Problems Attempted:
                              </p>
                              <p className="font-medium">
                                {stats.problemsAttempted} /{' '}
                                {stats.totalProblems}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Completion:
                              </p>
                              <p className="font-medium">
                                {stats.percentage.toFixed(1)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Your Score:
                              </p>
                              <p className="font-medium">
                                {stats.score.toFixed(1)} points
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Max Possible:
                              </p>
                              <p className="font-medium">
                                {stats.maxScore} points
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-1 lg:grid-cols-1">
                    <div className="flex flex-col rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="rounded-full bg-primary/10 p-2 text-primary">
                            <Target className="h-5 w-5" />
                          </div>
                          <h4 className="font-medium">Total Score</h4>
                        </div>
                        <p className="text-2xl font-bold">
                          {stats.percentage.toFixed(0)}%
                        </p>
                      </div>
                      <div className="mt-4">
                        <div
                          className={`text-sm ${status.color} mb-1 flex items-center gap-1 font-medium`}
                        >
                          <Trophy className="h-4 w-4" />
                          {status.text}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {stats.problemsAttempted > 0 ? (
                            <>
                              You scored {stats.score.toFixed(1)} out of a
                              possible {stats.maxScore} points
                            </>
                          ) : (
                            'No problems attempted yet'
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        Last attempt:{' '}
                        {sessionSummaries[0]?.created_at
                          ? formatDistanceToNow(
                              new Date(sessionSummaries[0].created_at),
                              { addSuffix: true }
                            )
                          : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs
              defaultValue="sessions"
              value={activeTab}
              onValueChange={handleTabChange}
              className="w-full"
            >
              <div className="mb-4 flex items-center justify-between">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="sessions">Session History</TabsTrigger>
                  <TabsTrigger value="problems">Problem Summary</TabsTrigger>
                </TabsList>
                {activeTab === 'problems' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshProblemDetails}
                    disabled={loadingAllProblems}
                    className="ml-2"
                  >
                    {loadingAllProblems ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="mr-2 h-4 w-4" />
                    )}
                    Refresh
                  </Button>
                )}
              </div>

              <TabsContent value="sessions" className="w-full">
                <Card>
                  <CardHeader>
                    <CardTitle>Session History</CardTitle>
                    <CardDescription>
                      View your past attempts for this challenge
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion
                      type="multiple"
                      value={expandedSessions}
                      onValueChange={handleAccordionValueChange}
                      className="w-full"
                    >
                      {sessionSummaries.map((session, index) => (
                        <AccordionItem
                          key={session.id}
                          value={session.id}
                          className="border-b last:border-b-0"
                        >
                          <AccordionTrigger className="relative px-4 py-3 hover:bg-muted/50">
                            {loadingSessions[session.id] && (
                              <div className="absolute top-1/2 right-12 -translate-y-1/2">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              </div>
                            )}
                            <div className="flex w-full items-center justify-between pr-4">
                              <span>
                                Session from{' '}
                                {new Date(
                                  session.created_at
                                ).toLocaleDateString()}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {formatDistanceToNow(
                                  new Date(session.created_at),
                                  { addSuffix: true }
                                )}
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-0 pt-0 pb-4">
                            {loadingSessions[session.id] ? (
                              <SessionDetailsSkeleton />
                            ) : loadedSessions[session.id] ? (
                              <div className="transition-all duration-200 ease-in-out">
                                <SessionCard
                                  session={{
                                    ...loadedSessions[session.id].session,
                                    problems:
                                      loadedSessions[session.id].problems,
                                  }}
                                  sessionIndex={index}
                                />

                                <div className="grid grid-cols-1 gap-4 px-6 md:grid-cols-2">
                                  {loadedSessions[session.id].problems.map(
                                    (
                                      problem: Problem,
                                      problemIndex: number
                                    ) => (
                                      <ProblemCard
                                        key={problem.id}
                                        problem={problem}
                                        problemIndex={problemIndex}
                                        sessionIndex={index}
                                      />
                                    )
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="py-4 text-center text-muted-foreground">
                                No data available for this session
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="problems" className="w-full">
                <Card>
                  <CardHeader>
                    <CardTitle>Problem Summary</CardTitle>
                    <CardDescription>
                      View your performance across all problems in this
                      challenge
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingAllProblems ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {Array(4)
                          .fill(0)
                          .map((_, i) => (
                            <div
                              key={i}
                              className="h-40 animate-pulse rounded-lg border p-4"
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-muted-foreground/20"></div>
                                  <div className="h-5 w-24 rounded bg-muted-foreground/20"></div>
                                </div>
                                <div className="h-5 w-14 rounded-full bg-muted-foreground/20"></div>
                              </div>
                              <div className="mb-2 h-4 w-3/4 rounded bg-muted-foreground/20"></div>
                              <div className="mb-6 h-4 w-1/2 rounded bg-muted-foreground/20"></div>
                              <div className="h-14 rounded bg-muted-foreground/20"></div>
                            </div>
                          ))}
                      </div>
                    ) : allProblems ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {allProblems.map((problem, index) => (
                          <ProblemCard
                            key={problem.id}
                            problem={problem}
                            problemIndex={index}
                            sessionIndex={-1}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-muted-foreground">
                        No problem data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
