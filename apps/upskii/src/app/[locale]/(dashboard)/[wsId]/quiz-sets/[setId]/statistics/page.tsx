import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  ArrowLeft,
  BarChart3,
  Target,
  TrendingUp,
  Users,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

interface QuizStats {
  id: string;
  question: string;
  totalAttempts: number;
  uniqueStudents: number;
  averageScore: number;
  passRate: number;
  lastAttempt: string | null;
}

interface Props {
  params: Promise<{
    wsId: string;
    setId: string;
  }>;
}

export default async function QuizSetStatisticsPage({ params }: Props) {
  const t = await getTranslations('quiz-set-statistics');
  const { wsId, setId } = await params;

  const stats = await getQuizSetStatistics(setId);

  const overallStats = {
    totalQuizzes: stats.length,
    totalAttempts: stats.reduce((sum, s) => sum + s.totalAttempts, 0),
    totalStudents: new Set(
      stats.flatMap((s) => Array(s.uniqueStudents).fill(0))
    ).size,
    averagePassRate:
      stats.length > 0
        ? stats.reduce((sum, s) => sum + s.passRate, 0) / stats.length
        : 0,
  };

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${wsId}/quiz-sets/${setId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('back')}
          </Link>
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <BarChart3 className="h-8 w-8" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">
            Comprehensive analytics for all quizzes in this set
          </p>
        </div>
      </div>

      <Separator />

      {/* Overall Statistics Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-blue-500" />
              {t('total_quizzes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {overallStats.totalQuizzes}
            </div>
            <p className="text-muted-foreground text-xs">
              {t('active_quizzes')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-green-500" />
              {t('total_attempts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {overallStats.totalAttempts}
            </div>
            <p className="text-muted-foreground text-xs">
              {t('accross_all_quizzes')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4 text-purple-500" />
              {t('active_students')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {overallStats.totalStudents}
            </div>
            <p className="text-muted-foreground text-xs">
              {t('unique_participants')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-orange-500" />
              {t('average_pass_rate')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {overallStats.averagePassRate.toFixed(1)}%
            </div>
            <p className="text-muted-foreground text-xs">
              70% passing threshold
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Individual Quiz Performance */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">
            {t('individual_quiz_performance')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {stats.length} quizzes analyzed
          </p>
        </div>

        {stats.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">{t('no_quizzes')}</h3>
              <p className="text-muted-foreground">
                {t('no_quizzes_description')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {stats.map((quiz, index) => (
              <Card key={quiz.id} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="mb-1 line-clamp-2 text-lg">
                        Quiz #{index + 1}: {quiz.question}
                      </CardTitle>
                      <CardDescription>Quiz ID: {quiz.id}</CardDescription>
                    </div>
                    <div className="text-right">
                      <div
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          quiz.passRate >= 80
                            ? 'bg-green-100 text-green-800'
                            : quiz.passRate >= 60
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {quiz.passRate >= 80
                          ? 'Excellent'
                          : quiz.passRate >= 60
                            ? 'Good'
                            : 'Needs Attention'}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {quiz.totalAttempts}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {t('total_attempts')}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {quiz.uniqueStudents}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {t('unique_participants')}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {quiz.averageScore}%
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {t('average_score')}
                      </div>
                    </div>
                    <div className="text-center">
                      <div
                        className={`text-2xl font-bold ${
                          quiz.passRate >= 70
                            ? 'text-green-600'
                            : quiz.passRate >= 50
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}
                      >
                        {quiz.passRate}%
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {t('pass_rate')}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium">
                        {quiz.lastAttempt
                          ? new Date(quiz.lastAttempt).toLocaleDateString()
                          : 'Never'}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t('last_attempt')}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function getQuizSetStatistics(setId: string): Promise<QuizStats[]> {
  const supabase = await createClient();

  try {
    // Get all quizzes in this set
    const { data: quizzes } = await supabase
      .from('quiz_set_quizzes')
      .select('...workspace_quizzes(id, question)')
      .eq('set_id', setId);

    if (!quizzes) return [];

    const quizStats: QuizStats[] = [];

    for (const quiz of quizzes) {
      if (!quiz.id) continue;

      // Get quiz attempts and scores
      const { data: attempts } = await supabase
        .from('workspace_quiz_attempts' as any)
        .select('user_id, score, created_at')
        .eq('quiz_id', quiz.id);

      if (!attempts) continue;

      const totalAttempts = attempts.length;
      const uniqueStudents = new Set(attempts.map((a) => a.user_id)).size;
      const averageScore =
        attempts.length > 0
          ? attempts.reduce((sum, a) => sum + (a.score || 0), 0) /
            attempts.length
          : 0;
      const passRate =
        attempts.length > 0
          ? (attempts.filter((a) => (a.score || 0) >= 70).length /
              attempts.length) *
            100
          : 0;
      const lastAttempt =
        attempts.length > 0
          ? attempts.sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            )[0].created_at
          : null;

      quizStats.push({
        id: quiz.id,
        question: quiz.question || 'Untitled Quiz',
        totalAttempts,
        uniqueStudents,
        averageScore: Math.round(averageScore * 100) / 100,
        passRate: Math.round(passRate * 100) / 100,
        lastAttempt,
      });
    }

    return quizStats;
  } catch (error) {
    console.error('Error fetching quiz statistics:', error);
    return [];
  }
}
