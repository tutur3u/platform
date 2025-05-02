'use client';

import UserSettingsDialog from '@/app/[locale]/(marketing)/settings-dialog';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { User, UserPrivateDetails } from '@tuturuuu/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Dialog } from '@tuturuuu/ui/dialog';
import {
  Award,
  Bolt,
  BookOpen,
  Calendar,
  ChevronRight,
  Clock,
  ExternalLink,
  Lock,
  Medal,
  Rocket,
  ScrollText,
  Share2,
  Sparkles,
  Target,
  Trophy,
  UserIcon,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { getCurrentUser } from '@tuturuuu/utils/client/user-helper';
import { cn } from '@tuturuuu/utils/format';
import { format, formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface RecentActivity {
  id: string;
  problemId: string;
  problemTitle: string;
  score: number;
  date: string;
}

interface Challenge {
  id: string;
  title: string;
  description: string;
  score: number;
  problemCount: number;
  attemptedProblems: number;
}

interface BestProblemScore {
  id: string;
  score: number;
  challengeId: string;
}

interface NearbyRank {
  id: string;
  score: number;
  isCurrentUser: boolean;
}

interface ProfileData {
  id: string;
  name: string;
  avatar: string;
  joinedDate: string | null;
  bio: string | null;
  totalScore: number;
  rank: number;
  challengeCount: number;
  challengeScores: Record<string, number>;
  // Additional fields for improved UI
  problemCount: number;
  totalAvailableProblems: number;
  problemsAttemptedPercentage: number;
  bestProblemScores: BestProblemScore[];
  nearbyRanks: NearbyRank[];
  recentActivity: RecentActivity[];
  challenges: Challenge[];
}

export default function UserProfileClient({
  profile,
}: {
  profile: ProfileData;
}) {
  const supabase = createClient();

  const [user, setUser] = useState<(User & UserPrivateDetails) | null>(null);
  const [copied, setCopied] = useState(false);

  const t = useTranslations('nova.profile-page');

  useEffect(() => {
    const fetchUser = async () => {
      const user = await getCurrentUser();
      setUser(user);
    };
    fetchUser();
  }, [supabase.auth]);

  // Share profile functionality
  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: `${profile.name}'s Profile | Nova`,
          text: `Check out ${profile.name}'s prompt engineering profile on Nova!`,
          url: window.location.href,
        })
        .catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isCurrentUser = user?.id === profile.id;
  const joinedDate = profile.joinedDate ? new Date(profile.joinedDate) : null;
  const formattedJoinedDate = joinedDate?.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Determine achievements based on profile data
  const achievements = [
    {
      id: 'early_adopter',
      title: t('achievements.adopter'),
      description: t('achievements.adopter-description'),
      icon: <Rocket className="h-5 w-5" />,
      color: 'text-dynamic-blue',
      bgColor: 'bg-dynamic-blue/10',
    },
    {
      id: 'challenge_master',
      title: t('achievements.master'),
      description: t('achievements.master-description'),
      unlocked: profile.challengeCount >= 5,
      icon: <Trophy className="h-5 w-5" />,
      color: 'text-dynamic-yellow',
      bgColor: 'bg-dynamic-yellow/10',
    },
    {
      id: 'high_scorer',
      title: t('achievements.high-scorer'),
      description: t('achievements.high-scorer-description'),
      unlocked: profile.totalScore > 500,
      icon: <Target className="h-5 w-5" />,
      color: 'text-dynamic-green',
      bgColor: 'bg-dynamic-green/10',
    },
    {
      id: 'top_rank',
      title: t('achievements.top-rank'),
      description: t('achievements.top-rank-description'),
      unlocked: profile.rank <= 10,
      icon: <Medal className="h-5 w-5" />,
      color: 'text-dynamic-purple',
      bgColor: 'bg-dynamic-purple/10',
    },
    {
      id: 'consistent',
      title: t('achievements.consistent'),
      description: t('achievements.consistent-description'),
      unlocked: profile.recentActivity.length >= 10,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-dynamic-indigo',
      bgColor: 'bg-dynamic-indigo/10',
    },
    {
      id: 'prompt_master',
      title: t('achievements.prompt-master'),
      description: t('achievements.prompt-master-description'),
      unlocked: profile.challenges.some((c) => c.score >= 9.5),
      icon: <Sparkles className="h-5 w-5" />,
      color: 'text-dynamic-pink',
      bgColor: 'bg-dynamic-pink/10',
    },
  ];

  const unlockedAchievements = achievements.filter((a) => a.unlocked);

  // Determine best challenge
  let bestChallenge = null;
  let highestScore = 0;

  for (const challenge of profile.challenges) {
    if (challenge.score > highestScore) {
      highestScore = challenge.score;
      bestChallenge = challenge;
    }
  }

  // Get user activity stats
  const activityStats = {
    totalSubmissions: profile.recentActivity.length,
    avgScore: profile.recentActivity.length
      ? profile.recentActivity.reduce((sum, a) => sum + a.score, 0) /
        profile.recentActivity.length
      : 0,
    bestScore: profile.recentActivity.length
      ? Math.max(...profile.recentActivity.map((a) => a.score))
      : 0,
    lastActive: profile?.recentActivity?.[0]?.date
      ? formatDistanceToNow(new Date(profile?.recentActivity?.[0]?.date), {
          addSuffix: true,
        })
      : 'Never',
  };

  // Generate a level based on total score
  const level = Math.floor(profile.totalScore / 500) + 1;
  // const nextLevel = level + 1;
  // const levelProgress = ((profile.totalScore % 500) / 500) * 100;

  // Get status text and color based on overall progress
  const getProgressStatus = (percentage: number) => {
    if (percentage >= 90)
      return { text: t('progress.excellent'), color: 'text-dynamic-blue' };
    if (percentage >= 75)
      return { text: t('progress.great'), color: 'text-dynamic-green' };
    if (percentage >= 60)
      return { text: t('progress.good'), color: 'text-dynamic-yellow' };
    if (percentage >= 40)
      return { text: t('progress.progress'), color: 'text-dynamic-orange' };
    return { text: t('progress.started'), color: 'text-dynamic-red' };
  };

  const overallStatus = getProgressStatus(profile.problemsAttemptedPercentage);

  const [open, setOpen] = useState(false);

  // Implement Role check
  const role = 'Teacher'; // Replace with actual role check logic

  return (
    <div className="container max-w-6xl pt-8 pb-16">
      {user && (
        <Dialog open={open} onOpenChange={setOpen}>
          <UserSettingsDialog user={user} />
        </Dialog>
      )}
      {/* Breadcrumb navigation */}
      <nav className="mb-8 flex items-center space-x-2 text-sm text-muted-foreground">
        <Link href="/home" className="hover:text-foreground">
          {t('breadcrumb.home')}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/leaderboard" className="hover:text-foreground">
          {t('breadcrumb.leaderboard')}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="font-medium text-foreground">{profile.name}</span>
      </nav>

      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 overflow-hidden rounded-xl border bg-card/50 p-6 shadow-sm"
      >
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="mx-auto flex flex-col items-center gap-4 sm:flex-row md:mx-0">
            <div className="relative">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="relative"
              >
                <Avatar className="h-20 w-20 ring-2 ring-primary ring-offset-2 ring-offset-background sm:h-24 sm:w-24">
                  <AvatarImage src={profile.avatar} alt={profile.name} />
                  <AvatarFallback className="text-lg">
                    {profile.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -top-1 -right-1 rounded-full border border-background bg-background p-1 shadow-md dark:bg-card">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-primary">
                    {level}
                  </div>
                </div>
              </motion.div>
            </div>
            <div>
              <h1 className="text-center text-3xl font-bold md:text-left">
                {profile.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {formattedJoinedDate && (
                  <div className="mx-auto flex items-center text-sm text-muted-foreground md:mx-0">
                    <Calendar className="mr-1 h-4 w-4" />
                    {t('joined')}: {formattedJoinedDate}
                  </div>
                )}
                <div className="mx-auto flex items-center text-sm text-muted-foreground md:mx-0">
                  <UserIcon className="mr-1 h-4 w-4" />
                  {t('role')}: {role == 'Teacher' ? t('teacher') : t('student')}
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto flex items-center gap-2 self-end md:mx-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleShare}
                    size="icon"
                    variant="outline"
                    className="rounded-full"
                  >
                    {copied ? (
                      <motion.span
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                      >
                        ✓
                      </motion.span>
                    ) : (
                      <Share2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('share-profile')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isCurrentUser && (
              <Button
                onClick={() => setOpen(true)}
                variant="outline"
                className="gap-2 rounded-full"
              >
                <span>{t('edit-profile')}</span>
              </Button>
            )}
          </div>
        </div>
        {/* Bio Section */}
        <div className="mt-4 flex w-full flex-col justify-between gap-4 rounded-md border bg-muted/30 p-4 text-sm">
          <div className="mx-auto flex gap-2 md:mx-0">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold">{t('bio')}</span>
          </div>
          <p className="text-muted-foreground">{profile.bio}</p>
        </div>

        {/* Level Progress */}
        {/*
                <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">
              {t('level')} {level}
            </div>
            <div className="text-muted-foreground text-sm">
              {profile.totalScore.toFixed(1)} / {nextLevel * 500} {t('points')}
            </div>
          </div>
          <Progress value={levelProgress} className="h-2" />
        </div>
         */}
      </motion.div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column - Stats and Achievements */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          {/* Stats Overview Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  {t('stats.title')}
                </CardTitle>
                <CardDescription>{t('stats.description')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">
                      {t('stats.total-score')}
                    </span>
                    <span className="text-2xl font-bold">
                      {profile.totalScore.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">
                      {t('stats.rank')}
                    </span>
                    <span className="text-2xl font-bold">#{profile.rank}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">
                      {t('stats.problems-attempted')}
                    </span>
                    <span className="text-2xl font-bold">
                      {profile.problemCount}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">
                      {t('stats.challenges')}
                    </span>
                    <span className="text-2xl font-bold">
                      {profile.challengeCount}
                    </span>
                  </div>
                </div>

                {/* Overall Progress */}
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t('stats.overall-progress')}
                    </span>
                    <span
                      className={`text-sm font-medium ${overallStatus.color}`}
                    >
                      {overallStatus.text}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress
                      value={profile.problemsAttemptedPercentage}
                      className="h-2"
                    />
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span>
                        {profile.problemCount} /{' '}
                        {profile.totalAvailableProblems} {t('stats.problems')}
                      </span>
                      <span>
                        {Math.round(profile.problemsAttemptedPercentage)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Nearby Ranks */}
                {profile.nearbyRanks.length > 0 && (
                  <div className="mt-4">
                    <h4 className="mb-2 text-sm font-medium">
                      {t('stats.leaderboard-position')}
                    </h4>
                    <div className="space-y-2 rounded-md bg-muted/30 p-2">
                      {profile.nearbyRanks.map((rank, index) => {
                        const rankNumber =
                          profile.rank -
                          (profile.nearbyRanks.findIndex(
                            (r) => r.isCurrentUser
                          ) -
                            index);
                        return (
                          <div
                            key={rank.id}
                            className={`flex items-center justify-between rounded-md p-2 text-sm ${
                              rank.isCurrentUser
                                ? 'bg-primary/10 font-medium'
                                : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">
                                #{rankNumber}
                              </span>
                              {rank.isCurrentUser ? (
                                <span>{profile.name}</span>
                              ) : (
                                <span>User</span>
                              )}
                            </div>
                            <span className="font-medium">
                              {rank.score.toFixed(1)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Achievements Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  {t('achievements.title')}
                </CardTitle>
                <CardDescription>
                  {unlockedAchievements.length} {t('achievements.unlocked')}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className={cn(
                      'flex items-start gap-3 rounded-lg p-3 transition-colors',
                      achievement.unlocked
                        ? achievement.bgColor
                        : 'bg-muted/30 opacity-70 saturate-0'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                        achievement.unlocked
                          ? achievement.bgColor
                          : 'bg-muted/50'
                      )}
                    >
                      <div
                        className={cn(
                          achievement.unlocked
                            ? achievement.color
                            : 'text-muted-foreground'
                        )}
                      >
                        {achievement.icon}
                      </div>
                    </div>
                    <div>
                      <div className="leading-none font-medium">
                        {achievement.title}
                        {!achievement.unlocked && (
                          <Lock className="ml-1 inline h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {achievement.description}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right Column - Tabs for Challenges, Activity, etc */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="mb-4 grid h-auto w-full grid-cols-3">
                <TabsTrigger value="overview">
                  <Bolt className="mr-2 h-4 w-4" /> {t('tabs.overview')}
                </TabsTrigger>
                <TabsTrigger value="challenges">
                  <Trophy className="mr-2 h-4 w-4" /> {t('tabs.challenges')}
                </TabsTrigger>
                <TabsTrigger value="activity">
                  <Clock className="mr-2 h-4 w-4" /> {t('tabs.activity')}
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                {/* Best Performance */}
                {bestChallenge && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-dynamic-yellow" />
                        {t('overview.best-performance')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-lg font-medium">
                            {bestChallenge.title}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {bestChallenge.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center text-xl font-bold text-dynamic-yellow">
                            {bestChallenge.score.toFixed(1)}
                            <Trophy className="ml-1 h-5 w-5" />
                          </div>
                          <div className="text-sm">
                            {bestChallenge.attemptedProblems} /{' '}
                            {bestChallenge.problemCount}{' '}
                            {t('overview.problems')}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                        asChild
                      >
                        <Link href={`/challenges/${bestChallenge.id}`}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {t('overview.view-challenge')}
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                )}

                {/* Recent Activity Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-blue-500" />
                      {t('overview.recent-activity')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <div className="text-sm text-muted-foreground">
                          {t('overview.problem-submissions')}
                        </div>
                        <div className="text-3xl font-bold">
                          {activityStats.totalSubmissions}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="text-sm text-muted-foreground">
                          {t('overview.avg-score')}
                        </div>
                        <div className="text-3xl font-bold">
                          {activityStats.avgScore.toFixed(1)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="text-sm text-muted-foreground">
                          {t('overview.best-score')}
                        </div>
                        <div className="text-3xl font-bold">
                          {activityStats.bestScore.toFixed(1)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="text-sm text-muted-foreground">
                          {t('overview.last-active')}
                        </div>
                        <div className="text-xl font-bold">
                          {activityStats.lastActive}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Top Problem Scores */}
                {profile.bestProblemScores.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-violet-500" />
                        {t('overview.top-problems')}
                      </CardTitle>
                      <CardDescription>
                        {t('overview.top-problems-description')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {profile.bestProblemScores
                          .sort((a, b) => b.score - a.score)
                          .slice(0, 5)
                          .map((problem, i) => (
                            <div
                              key={problem.id}
                              className="flex items-center justify-between rounded-md bg-muted/30 p-2 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    i === 0
                                      ? 'border-dynamic-yellow/10 bg-dynamic-yellow/10 text-dynamic-yellow'
                                      : i === 1
                                        ? 'border-dynamic-yellow/10 bg-dynamic-yellow/10 text-dynamic-yellow'
                                        : i === 2
                                          ? 'border-dynamic-yellow/10 bg-dynamic-yellow/10 text-dynamic-yellow'
                                          : 'bg-muted/30'
                                  )}
                                >
                                  #{i + 1}
                                </Badge>
                                <span>Problem</span>
                              </div>
                              <div className="font-medium">
                                {problem.score.toFixed(1)} / 10
                              </div>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Challenges Tab */}
              <TabsContent value="challenges" className="space-y-6">
                {profile.challenges.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {profile.challenges
                      .sort((a, b) => b.score - a.score)
                      .map((challenge) => (
                        <Card key={challenge.id} className="overflow-hidden">
                          <CardHeader className="pb-2">
                            <CardTitle className="truncate text-lg">
                              {challenge.title}
                            </CardTitle>
                            <CardDescription className="line-clamp-2">
                              {challenge.description}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="mb-2 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <ScrollText className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">
                                  {challenge.attemptedProblems} /{' '}
                                  {challenge.problemCount}{' '}
                                  {t('challenges.problems')}
                                </span>
                              </div>
                              <div className="text-xl font-bold">
                                {challenge.score.toFixed(1)}
                              </div>
                            </div>

                            {/* Progress bar for challenge completion */}
                            <div className="mt-2">
                              <Progress
                                value={
                                  (challenge.attemptedProblems /
                                    Math.max(1, challenge.problemCount)) *
                                  100
                                }
                                className="h-2"
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                ) : (
                  <div className="p-10 text-center">
                    <ScrollText className="mx-auto h-10 w-10 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-medium">
                      {t('challenges.no-challenges')}
                    </h3>
                    <p className="mt-2 text-muted-foreground">
                      {t('challenges.no-challenges-description')}
                    </p>
                    <Button className="mt-4" asChild>
                      <Link href="/challenges">
                        {t('challenges.browse-challenges')}
                      </Link>
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      {t('activity.recent')}
                    </CardTitle>
                    <CardDescription>
                      {t('activity.description')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {profile.recentActivity.length > 0 ? (
                      <div className="space-y-4">
                        {profile.recentActivity.map((activity) => (
                          <div
                            key={activity.id}
                            className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <div className="font-medium">
                                {activity.problemTitle}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {format(new Date(activity.date), 'PPP p')}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                              <div className="text-2xl font-bold">
                                {activity.score.toFixed(1)}
                              </div>
                              <Badge
                                variant="outline"
                                className={
                                  activity.score >= 9
                                    ? 'border-dynamic-green/10 bg-dynamic-green/10 text-dynamic-green'
                                    : activity.score >= 7
                                      ? 'border-dynamic-blue/10 bg-dynamic-blue/10 text-dynamic-blue'
                                      : activity.score >= 5
                                        ? 'border-dynamic-yellow/10 bg-dynamic-yellow/10 text-dynamic-yellow'
                                        : 'border-dynamic-red/10 bg-dynamic-red/10 text-dynamic-red'
                                }
                              >
                                {activity.score >= 9
                                  ? t('activity.excellent')
                                  : activity.score >= 7
                                    ? t('activity.good')
                                    : activity.score >= 5
                                      ? t('activity.average')
                                      : t('activity.needs-work')}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <Clock className="mx-auto h-10 w-10 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium">
                          {t('activity.no-activity')}
                        </h3>
                        <p className="mt-2 text-muted-foreground">
                          {t('activity.no-activity-description')}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
