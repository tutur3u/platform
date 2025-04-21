'use client';

import ProblemCard from './components/ProblemCard';
import SessionCard from './components/SessionCard';
import { ResultsData } from './types';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ArrowLeft, BookOpen, RefreshCcw, Trophy } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useRouter } from 'next/navigation';

interface Props {
  data: ResultsData;
}

export default function ResultClient({ data }: Props) {
  const router = useRouter();

  // Maximum score constant - each problem is worth 10 points
  const MAX_SCORE_PER_PROBLEM = 10;

  // Calculate overall challenge stats
  const calculateOverallStats = () => {
    if (data.sessions.length === 0)
      return {
        score: 0,
        maxScore: 0,
        percentage: 0,
        problemsAttempted: 0,
        totalProblems: 0,
      };

    const totalProblems = data.sessions[0]?.problems.length || 0;
    const maxPossibleScore = totalProblems * MAX_SCORE_PER_PROBLEM;

    let bestTotalScore = 0;
    const problemsAttempted = new Set();

    data.sessions.forEach((session) => {
      session.problems.forEach((problem, index) => {
        if (problem.submissions.length > 0) {
          problemsAttempted.add(index);

          const bestScore = Math.max(
            ...problem.submissions.map((s) => s.total_score || 0),
            bestTotalScore > 0 ? bestTotalScore / totalProblems : 0
          );

          bestTotalScore = Math.max(bestTotalScore, bestScore * totalProblems);
        }
      });
    });

    return {
      score: bestTotalScore,
      maxScore: maxPossibleScore,
      percentage: (bestTotalScore / maxPossibleScore) * 100,
      problemsAttempted: problemsAttempted.size,
      totalProblems,
    };
  };

  const stats = calculateOverallStats();

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
              <h1 className="text-3xl font-bold">{data.challenge.title}</h1>
              <p className="text-muted-foreground mt-1">
                {data.challenge.description || 'Challenge Results'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => router.push(`/challenges/${data.challenge.id}`)}
            variant="outline"
            className="gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            <span>Retry Challenge</span>
          </Button>
        </div>

        {data.sessions.length === 0 ? (
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
                          {data.sessions.length}
                        </div>
                      </div>
                      <div className="bg-card/50 hover:bg-card/80 rounded-lg border p-3 text-center transition-colors">
                        <div className="text-muted-foreground text-xs uppercase">
                          Problems
                        </div>
                        <div className="mt-1 text-2xl font-bold">
                          {data.sessions[0]?.problems.length || 0}
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

            <Tabs defaultValue="sessions" className="mb-8 w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="sessions">
                  Sessions ({data.sessions.length})
                </TabsTrigger>
                <TabsTrigger value="problems">
                  All Problems ({data.sessions[0]?.problems.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sessions">
                {data.sessions.map((session, sessionIndex) => (
                  <div
                    key={sessionIndex}
                    className="animate-in fade-in-50 slide-in-from-bottom-3 mb-8 duration-500"
                  >
                    <SessionCard
                      session={session}
                      sessionIndex={sessionIndex}
                    />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                      {session.problems.map((problem, problemIndex) => (
                        <ProblemCard
                          key={problemIndex}
                          problem={problem}
                          problemIndex={problemIndex}
                          sessionIndex={sessionIndex}
                        />
                      ))}
                    </div>

                    {sessionIndex < data.sessions.length - 1 && (
                      <div className="col-span-full mt-8 w-full">
                        <Separator />
                      </div>
                    )}
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="problems">
                <div className="animate-in fade-in-50 slide-in-from-bottom-3 grid grid-cols-1 gap-4 duration-500 md:grid-cols-2 2xl:grid-cols-3">
                  {data.sessions[0]?.problems.map((problem, problemIndex) => {
                    // Combine submissions from all sessions for this problem
                    const allSubmissions = data.sessions.flatMap(
                      (session) =>
                        session.problems[problemIndex]?.submissions || []
                    );

                    const combinedProblem = {
                      ...problem,
                      submissions: allSubmissions,
                    };

                    return (
                      <ProblemCard
                        key={problemIndex}
                        problem={combinedProblem}
                        problemIndex={problemIndex}
                        sessionIndex={-1} // Special marker for "all sessions" view
                      />
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
