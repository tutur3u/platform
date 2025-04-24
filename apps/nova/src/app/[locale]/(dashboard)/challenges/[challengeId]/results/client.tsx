'use client';

import { fetchAllProblems, fetchSessionDetails } from './actions';
import ProblemCard from './components/ProblemCard';
import SessionCard from './components/SessionCard';
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
import { useState } from 'react';

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

interface Props {
  challengeId: string;
  challenge: any;
  sessionSummaries: SessionSummary[];
  stats: Stats;
  userId: string;
}

export default function ResultClient({
  challengeId,
  challenge,
  sessionSummaries,
  stats,
  userId,
}: Props) {
  const router = useRouter();
  const [expandedSessions, setExpandedSessions] = useState<string[]>([]);
  const [loadedSessions, setLoadedSessions] = useState<Record<string, any>>({});
  const [loadingSessions, setLoadingSessions] = useState<
    Record<string, boolean>
  >({});
  const [_activeTab, setActiveTab] = useState('sessions');
  const [loadingAllProblems, setLoadingAllProblems] = useState(false);
  const [allProblems, setAllProblems] = useState<any[] | null>(null);

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

      try {
        const sessionData = await fetchSessionDetails(
          newlyExpanded,
          challengeId
        );
        setLoadedSessions((prev) => ({
          ...prev,
          [newlyExpanded]: sessionData,
        }));

        console.log('fetch new ss data', sessionData);
      } catch (error) {
        console.error('Error loading session:', error);
      } finally {
        setLoadingSessions((prev) => ({ ...prev, [newlyExpanded]: false }));
      }
    }

    setExpandedSessions(value);
  };

  const handleTabChange = async (value: string) => {
    setActiveTab(value);

    // If switching to problems tab and we haven't loaded them yet
    if (value === 'problems' && !allProblems && !loadingAllProblems) {
      setLoadingAllProblems(true);
      try {
        const result = await fetchAllProblems(challengeId, userId);
        setAllProblems(result.problems);

        console.log('res', result);
      } catch (error) {
        console.error('Error loading all problems:', error);
      } finally {
        setLoadingAllProblems(false);
      }
    }
  };

  return (
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="mb-4 flex items-center gap-4 md:mb-0">
            <Button
              onClick={() => router.push('/challenges')}
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full shadow-sm"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{challenge.title}</h1>
              <p className="text-muted-foreground mt-1">
                {challenge.description || 'Challenge Results'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => router.push(`/challenges/${challengeId}`)}
            variant="outline"
            className="gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            <span>Retry Challenge</span>
          </Button>
        </div>

        {sessionSummaries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Card className="max-w-md">
              <CardHeader className="text-center">
                <div className="bg-muted text-muted-foreground mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                  <BookOpen className="h-10 w-10" />
                </div>
                <CardTitle>No data available</CardTitle>
                <CardDescription>
                  We couldn't find any results for this challenge.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex justify-center">
                <Button
                  onClick={() => router.push('/challenges')}
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
                              <div className="bg-primary/10 text-primary flex items-center rounded-full px-3 py-1 text-sm font-medium">
                                <Trophy className="mr-1 h-4 w-4" />
                                {stats.score.toFixed(1)}/{stats.maxScore}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">
                                Maximum score: {MAX_SCORE_PER_PROBLEM} points
                                per problem
                              </p>
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
                        <p className="text-muted-foreground text-sm">
                          You've attempted {stats.problemsAttempted || 0} out of{' '}
                          {stats.totalProblems || 0} problems
                        </p>
                        <p className={`text-sm font-medium ${status.color}`}>
                          {status.text}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <div className="bg-card/50 hover:bg-card/80 rounded-lg border p-3 text-center transition-colors">
                        <div className="text-muted-foreground text-xs uppercase">
                          Sessions
                        </div>
                        <div className="mt-1 text-2xl font-bold">
                          {sessionSummaries.length}
                        </div>
                      </div>
                      <div className="bg-card/50 hover:bg-card/80 rounded-lg border p-3 text-center transition-colors">
                        <div className="text-muted-foreground text-xs uppercase">
                          Problems
                        </div>
                        <div className="mt-1 text-2xl font-bold">
                          {stats.totalProblems}
                        </div>
                      </div>
                      <div className="bg-card/50 hover:bg-card/80 rounded-lg border p-3 text-center transition-colors">
                        <div className="text-muted-foreground text-xs uppercase">
                          Total Score
                        </div>
                        <div className="mt-1 flex items-center justify-center">
                          <span
                            className={`text-2xl font-bold ${
                              stats.percentage >= 80
                                ? 'text-green-600'
                                : stats.percentage >= 60
                                  ? 'text-yellow-600'
                                  : stats.percentage >= 40
                                    ? 'text-orange-600'
                                    : 'text-red-600'
                            }`}
                          >
                            {stats.percentage.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-primary/5 flex flex-col items-center justify-center rounded-lg p-5">
                    <div className="text-center">
                      <div className="text-muted-foreground mb-2 text-sm">
                        Challenge Completed
                      </div>
                      <div className="relative flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-4xl font-bold">
                            {stats.percentage.toFixed(0)}%
                          </div>
                        </div>
                        <svg className="h-32 w-32" viewBox="0 0 100 100">
                          <circle
                            className="text-muted-foreground/20"
                            cx="50"
                            cy="50"
                            r="40"
                            stroke="currentColor"
                            strokeWidth="10"
                            fill="none"
                          />
                          <circle
                            className="text-primary"
                            cx="50"
                            cy="50"
                            r="40"
                            stroke="currentColor"
                            strokeWidth="10"
                            fill="none"
                            strokeDasharray="251.2"
                            strokeDashoffset={
                              251.2 - (251.2 * stats.percentage) / 100
                            }
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                      </div>
                      <div className="mt-2">
                        <span className={`text-sm font-medium ${status.color}`}>
                          {status.text}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs
              defaultValue="sessions"
              className="mb-8 w-full"
              onValueChange={handleTabChange}
            >
              <TabsList className="mb-4">
                <TabsTrigger value="sessions">
                  Sessions ({sessionSummaries.length})
                </TabsTrigger>
                <TabsTrigger value="problems">
                  All Problems ({stats.totalProblems})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sessions">
                <Accordion
                  type="multiple"
                  value={expandedSessions}
                  className="w-full"
                  onValueChange={handleAccordionValueChange}
                >
                  {sessionSummaries.map((session, sessionIndex) => (
                    <AccordionItem
                      key={session.id}
                      value={session.id}
                      className="animate-in fade-in-50 slide-in-from-bottom-3 bg-card/50 mb-4 rounded-lg border duration-500"
                    >
                      <AccordionTrigger className="px-6 py-4 hover:no-underline">
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/10 flex h-9 w-9 items-center justify-center rounded-full">
                              <Target className="text-primary h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold">
                                Session {sessionIndex + 1}
                              </h3>
                              <p className="text-muted-foreground text-sm">
                                {formatDistanceToNow(
                                  new Date(session.created_at),
                                  { addSuffix: true }
                                )}
                                {session.end_time &&
                                  ` • ${Math.floor(
                                    (new Date(session.end_time).getTime() -
                                      new Date(session.created_at).getTime()) /
                                      60000
                                  )} min`}
                              </p>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="pb-6 pt-0">
                        {loadingSessions[session.id] ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="text-primary h-8 w-8 animate-spin" />
                          </div>
                        ) : loadedSessions[session.id] ? (
                          <div>
                            <SessionCard
                              session={loadedSessions[session.id]}
                              sessionIndex={sessionIndex}
                            />
                            <div className="grid grid-cols-1 gap-4 px-6 md:grid-cols-2 2xl:grid-cols-3">
                              {loadedSessions[session.id].problems.map(
                                (problem: any, problemIndex: number) => (
                                  <ProblemCard
                                    key={problemIndex}
                                    problem={problem}
                                    problemIndex={problemIndex}
                                    sessionIndex={sessionIndex}
                                  />
                                )
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="py-4 text-center">
                            Failed to load session data
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>

              <TabsContent value="problems">
                {loadingAllProblems ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="text-primary h-8 w-8 animate-spin" />
                  </div>
                ) : allProblems ? (
                  <div className="animate-in fade-in-50 slide-in-from-bottom-3 grid grid-cols-1 gap-4 duration-500 md:grid-cols-2 2xl:grid-cols-3">
                    {allProblems.map((problem, problemIndex) => (
                      <ProblemCard
                        key={problemIndex}
                        problem={problem}
                        problemIndex={problemIndex}
                        sessionIndex={-1} // Special marker for "all sessions" view
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bg-card/50 rounded-lg border p-12 text-center">
                    <p className="text-muted-foreground mb-2">
                      Click to view all problems across sessions
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => handleTabChange('problems')}
                      className="mt-2"
                    >
                      Load Problems
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
