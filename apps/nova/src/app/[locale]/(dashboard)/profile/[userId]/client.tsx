'use client';

import { ThumbnailGrid } from './thumbnail-grid';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
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
import {
  Award,
  Bolt,
  BookOpen,
  Calendar,
  ChevronRight,
  Clock,
  ExternalLink,
  Info,
  Lock,
  Medal,
  Rocket,
  ScrollText,
  Share2,
  Sparkles,
  Target,
  Trophy,
  Users,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { format, formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface RecentActivity {
  id: number;
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
}

interface ProfileData {
  id: string;
  name: string;
  avatar: string;
  joinedDate: string | null;
  totalScore: number;
  rank: number;
  challengeCount: number;
  challengeScores: Record<string, number>;
  recentActivity: RecentActivity[];
  challenges: Challenge[];
}

export default function UserProfileClient({
  profile,
}: {
  profile: ProfileData;
}) {
  const supabase = createClient();
  const router = useRouter();
  const achievementsTabRef = useRef<HTMLButtonElement>(null);
  const activityTabRef = useRef<HTMLButtonElement>(null);

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [copied, setCopied] = useState(false);
  const [, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

  const daysActive = Math.ceil(
    (new Date().getTime() - (joinedDate?.getTime() || 0)) / (1000 * 3600 * 24)
  );

  // Determine achievements based on profile data
  const achievements = [
    {
      id: 'early_adopter',
      title: 'Early Adopter',
      description: "Joined during the platform's early days",
      unlocked: daysActive > 90,
      icon: <Rocket className="h-5 w-5" />,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      id: 'challenge_master',
      title: 'Challenge Master',
      description: 'Completed 5+ different challenges',
      unlocked: profile.challengeCount >= 5,
      icon: <Trophy className="h-5 w-5" />,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
    },
    {
      id: 'high_scorer',
      title: 'High Scorer',
      description: 'Achieved a score over 500 points',
      unlocked: profile.totalScore > 500,
      icon: <Target className="h-5 w-5" />,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      id: 'top_rank',
      title: 'Top Ranked',
      description: 'Reached the top 10 on the leaderboard',
      unlocked: profile.rank <= 10,
      icon: <Medal className="h-5 w-5" />,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      id: 'consistent',
      title: 'Consistent Learner',
      description: 'Submitted solutions regularly',
      unlocked: profile.recentActivity.length >= 10,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
    },
    {
      id: 'prompt_master',
      title: 'Prompt Master',
      description: 'Achieved perfect scores in multiple challenges',
      unlocked: profile.challenges.some((c) => c.score >= 9.5),
      icon: <Sparkles className="h-5 w-5" />,
      color: 'text-rose-500',
      bgColor: 'bg-rose-500/10',
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

  // Generate a streak value (mock data - would need real streak data in a real implementation)
  const streak = Math.min(Math.floor(daysActive / 7), 15);

  // Generate a level based on total score
  const level = Math.floor(profile.totalScore / 500) + 1;
  const nextLevel = level + 1;
  const levelProgress = ((profile.totalScore % 500) / 500) * 100;

  return (
    <div className="container max-w-6xl pb-16 pt-8">
      {/* Breadcrumb navigation */}
      <nav className="text-muted-foreground mb-8 flex items-center space-x-2 text-sm">
        <Link href="/home" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/leaderboard" className="hover:text-foreground">
          Leaderboard
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">{profile.name}</span>
      </nav>

      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-card/50 mb-8 overflow-hidden rounded-xl border p-6 shadow-sm"
      >
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="relative">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="from-primary/30 to-primary/10 absolute -inset-0.5 rounded-full bg-gradient-to-br blur-md"
              />
              <Avatar className="border-background h-24 w-24 border-2 shadow-md">
                <AvatarImage src={profile.avatar} alt={profile.name} />
                <AvatarFallback className="text-xl">
                  {profile.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              {profile.rank <= 3 && (
                <div className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg">
                  <Trophy className="h-4 w-4" />
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold">{profile.name}</h1>
                {profile.rank <= 10 && (
                  <Badge className="bg-amber-500/20 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                    <Trophy className="mr-1 h-3.5 w-3.5" />
                    Top {profile.rank <= 3 ? profile.rank : 10}
                  </Badge>
                )}
                <Badge variant="outline" className="bg-card">
                  <Bolt className="mr-1 h-3.5 w-3.5 text-blue-500" />
                  Level {level}
                </Badge>
              </div>

              <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="flex items-center">
                  <Calendar className="mr-1.5 h-4 w-4" />
                  Joined {formattedJoinedDate}
                </span>

                <span className="hidden sm:inline-block">•</span>

                <span className="flex items-center">
                  <Trophy className="mr-1.5 h-4 w-4 text-amber-500" />
                  <span className="text-foreground font-medium">
                    Rank #{profile.rank}
                  </span>
                </span>

                <span className="hidden sm:inline-block">•</span>

                <span className="flex items-center">
                  <Users className="mr-1.5 h-4 w-4" />
                  {profile.challengeCount}{' '}
                  {profile.challengeCount === 1 ? 'Challenge' : 'Challenges'}
                </span>
              </div>

              {profile.totalScore > 0 && (
                <div className="mt-3">
                  <Badge
                    variant="outline"
                    className="border-primary/30 bg-primary/5 text-primary"
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {profile.totalScore.toLocaleString()} Points
                  </Badge>

                  {streak > 0 && (
                    <Badge
                      variant="outline"
                      className="ml-2 border-orange-500/30 bg-orange-500/5 text-orange-600 dark:text-orange-400"
                    >
                      <Bolt className="mr-1.5 h-3.5 w-3.5" />
                      {streak} Day Streak
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 self-end sm:self-center">
            {isCurrentUser && <Button variant="outline">Edit Profile</Button>}
            <Button
              variant="secondary"
              className="flex items-center gap-1"
              onClick={handleShare}
            >
              {copied ? 'Copied!' : 'Share'}
              <Share2 className="ml-1.5 h-4 w-4" />
            </Button>
            <Button onClick={() => router.push('/leaderboard')}>
              View Leaderboard
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Level progress bar */}
        <div className="mt-6">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Level {level}</span>
            <span className="text-muted-foreground">
              {Math.round(levelProgress)}% to Level {nextLevel}
            </span>
          </div>
          <Progress value={levelProgress} className="bg-primary/10 h-2" />
        </div>
      </motion.div>

      {/* Engagement stats bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <Card className="border-background/80 bg-card/50 overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center p-0">
            <div className="bg-primary/5 text-primary w-full py-2 text-center text-xs font-medium">
              SCORE
            </div>
            <div className="flex h-24 w-full flex-col items-center justify-center">
              <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full">
                <Trophy className="h-5 w-5" />
              </div>
              <p className="mt-1 text-2xl font-bold">
                {profile.totalScore.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-background/80 bg-card/50 overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center p-0">
            <div className="w-full bg-amber-500/5 py-2 text-center text-xs font-medium text-amber-600 dark:text-amber-400">
              RANK
            </div>
            <div className="flex h-24 w-full flex-col items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                <Medal className="h-5 w-5" />
              </div>
              <p className="mt-1 text-2xl font-bold">#{profile.rank}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-background/80 bg-card/50 overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center p-0">
            <div className="w-full bg-indigo-500/5 py-2 text-center text-xs font-medium text-indigo-600 dark:text-indigo-400">
              CHALLENGES
            </div>
            <div className="flex h-24 w-full flex-col items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500">
                <BookOpen className="h-5 w-5" />
              </div>
              <p className="mt-1 text-2xl font-bold">
                {profile.challengeCount}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-background/80 bg-card/50 overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center p-0">
            <div className="w-full bg-green-500/5 py-2 text-center text-xs font-medium text-green-600 dark:text-green-400">
              ACHIEVEMENTS
            </div>
            <div className="flex h-24 w-full flex-col items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <Award className="h-5 w-5" />
              </div>
              <p className="mt-1 text-2xl font-bold">
                {unlockedAchievements.length}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Profile Content */}
      <Tabs
        defaultValue="overview"
        className="w-full"
        onValueChange={setActiveTab}
      >
        <TabsList className="mb-8 grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="challenges">Challenges</TabsTrigger>
          <TabsTrigger value="achievements" ref={achievementsTabRef}>
            Achievements
          </TabsTrigger>
          <TabsTrigger value="activity" ref={activityTabRef}>
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-8">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Stats card */}
            <Card className="border-background/80 bg-card/50 md:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Info className="h-5 w-5 text-blue-500" />
                  Activity Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Submissions
                  </span>
                  <span className="font-medium">
                    {activityStats.totalSubmissions}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Average Score
                  </span>
                  <span className="font-medium">
                    {activityStats.avgScore.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Best Score
                  </span>
                  <span className="font-medium">
                    {activityStats.bestScore.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Last Active
                  </span>
                  <span className="font-medium">
                    {activityStats.lastActive}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Current Streak
                  </span>
                  <span className="font-medium">{streak} days</span>
                </div>
              </CardContent>
            </Card>

            {/* Best challenge */}
            {bestChallenge && (
              <Card className="border-primary/10 bg-card/50 overflow-hidden md:col-span-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-amber-500" />
                      Best Challenge Performance
                    </CardTitle>
                    <Badge className="bg-primary/20 text-primary">
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Top Score: {bestChallenge.score}
                    </Badge>
                  </div>
                  <CardDescription>
                    Highest scoring challenge completed by{' '}
                    {isCurrentUser ? 'you' : profile.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold">
                      {bestChallenge.title}
                    </h3>
                    <p className="text-muted-foreground">
                      {bestChallenge.description}
                    </p>
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span>Performance</span>
                        <span className="font-medium">
                          {Math.min(
                            100,
                            Math.round((bestChallenge.score / 10) * 100)
                          )}
                          %
                        </span>
                      </div>
                      <Progress
                        value={Math.min(
                          100,
                          Math.round((bestChallenge.score / 10) * 100)
                        )}
                        className="h-2"
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/10 border-t px-6 py-3">
                  <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground ml-auto text-sm"
                    onClick={() => {
                      if (achievementsTabRef.current) {
                        achievementsTabRef.current.click();
                      }
                    }}
                  >
                    View All Challenges
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>

          {/* Achievement thumbnails */}
          {unlockedAchievements.length > 0 && (
            <Card className="border-accent/10 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-green-500" />
                  Recent Achievements
                </CardTitle>
                <CardDescription>
                  Unlocked badges and accomplishments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ThumbnailGrid
                  items={unlockedAchievements
                    .slice(0, 6)
                    .map((achievement) => ({
                      id: achievement.id,
                      title: achievement.title,
                      description: achievement.description,
                      icon: achievement.icon,
                      color: achievement.color,
                      bgColor: achievement.bgColor,
                    }))}
                  columns={{ sm: 2, md: 3 }}
                />

                {unlockedAchievements.length > 6 && (
                  <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground mt-4 w-full"
                    onClick={() => {
                      if (achievementsTabRef.current) {
                        achievementsTabRef.current.click();
                      }
                    }}
                  >
                    View All Achievements
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent activity summary */}
          {profile.recentActivity.length > 0 && (
            <Card className="border-accent/10 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  Recent Activity
                </CardTitle>
                <CardDescription>
                  Latest prompt engineering submissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  {profile.recentActivity.slice(0, 3).map((activity, index) => (
                    <motion.li
                      key={activity.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      className="bg-card/50 hover:bg-card/80 overflow-hidden rounded-lg border shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between gap-4 p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                            <ScrollText className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {activity.problemTitle}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {formatDistanceToNow(new Date(activity.date), {
                                addSuffix: true,
                              })}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            activity.score >= 8
                              ? 'success'
                              : activity.score >= 5
                                ? 'default'
                                : 'outline'
                          }
                          className="flex-shrink-0"
                        >
                          Score: {activity.score}
                        </Badge>
                      </div>
                    </motion.li>
                  ))}
                </ul>
                {profile.recentActivity.length > 3 && (
                  <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground mt-4 w-full"
                    onClick={() => {
                      if (activityTabRef.current) {
                        activityTabRef.current.click();
                      }
                    }}
                  >
                    View All Activity
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Challenges Tab */}
        <TabsContent value="challenges" className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Challenge Performance</CardTitle>
              <CardDescription>
                All completed challenges with scores
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile.challenges.length > 0 ? (
                <ul className="space-y-4">
                  {profile.challenges.map((challenge, index) => (
                    <motion.li
                      key={challenge.id}
                      className="hover:bg-accent/5 rounded-lg border p-4 transition-colors"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-lg font-semibold">
                          {challenge.title}
                        </h3>
                        <Badge
                          variant={
                            challenge.score >= 80
                              ? 'success'
                              : challenge.score >= 50
                                ? 'default'
                                : 'outline'
                          }
                          className={cn(
                            'transition-all',
                            challenge.score >= 9.5 &&
                              'border-transparent bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:from-amber-500 hover:to-orange-600'
                          )}
                        >
                          {challenge.score >= 9.5 && (
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Score: {challenge.score}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mb-3 line-clamp-2 text-sm">
                        {challenge.description}
                      </p>
                      <div className="mt-2">
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span>Progress</span>
                          <span>
                            {Math.min(
                              100,
                              Math.floor((challenge.score / 10) * 100)
                            )}
                            %
                          </span>
                        </div>
                        <Progress
                          value={Math.min(
                            100,
                            Math.floor((challenge.score / 10) * 100)
                          )}
                          className={cn(
                            'h-2',
                            challenge.score >= 9.5
                              ? 'bg-gradient-to-r from-amber-200 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/30'
                              : ''
                          )}
                        />
                      </div>
                    </motion.li>
                  ))}
                </ul>
              ) : (
                <div className="flex h-24 items-center justify-center">
                  <p className="text-muted-foreground text-center">
                    No challenges completed yet
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Achievements Tab */}
        <TabsContent value="achievements" className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Achievements Showcase</CardTitle>
              <CardDescription>
                Badges and accomplishments earned
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {achievements.map((achievement, index) => (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className={cn(
                      'relative rounded-lg border p-4 transition-all',
                      achievement.unlocked
                        ? 'border-primary/20 bg-primary/5'
                        : 'border-dashed opacity-50'
                    )}
                  >
                    <div
                      className={cn(
                        'mb-3 flex h-12 w-12 items-center justify-center rounded-full',
                        achievement.unlocked
                          ? achievement.bgColor
                          : 'bg-muted/20',
                        achievement.unlocked
                          ? achievement.color
                          : 'text-muted-foreground'
                      )}
                    >
                      {achievement.icon}
                    </div>
                    <h3 className="text-lg font-semibold">
                      {achievement.title}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {achievement.description}
                    </p>
                    {achievement.unlocked && (
                      <Badge
                        className={cn('bg-primary/10 mt-3', achievement.color)}
                      >
                        <Sparkles className="mr-1 h-3 w-3" />
                        Unlocked
                      </Badge>
                    )}
                    {!achievement.unlocked && (
                      <Badge variant="outline" className="mt-3">
                        <Lock className="mr-1 h-3 w-3" />
                        Locked
                      </Badge>
                    )}
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Latest prompt engineering attempts and submissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile.recentActivity.length > 0 ? (
                <div className="space-y-8">
                  {profile.recentActivity.map((activity, index) => (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="hover:bg-accent/5 relative ml-6 rounded-lg border p-4 transition-colors"
                    >
                      <div className="bg-primary/10 text-primary absolute -left-10 flex h-8 w-8 items-center justify-center rounded-full">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-semibold">
                          {activity.problemTitle}
                        </h3>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(activity.date), 'PPP p')}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {formatDistanceToNow(new Date(activity.date), {
                                  addSuffix: true,
                                })}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-muted-foreground text-sm">
                          Submitted a solution
                        </p>
                        <Badge
                          variant={
                            activity.score >= 8
                              ? 'success'
                              : activity.score >= 5
                                ? 'default'
                                : 'outline'
                          }
                        >
                          Score: {activity.score}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex h-24 items-center justify-center">
                  <p className="text-muted-foreground text-center">
                    No recent activity
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
