'use client';

import { TeamActionDialog } from './dialog-content';
import { createClient } from '@tuturuuu/supabase/next/client';
import { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
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
  Award,
  ChevronRight,
  Info,
  Share2,
  Star,
  Target,
  Trophy,
  Users,
} from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { generateFunName, getInitials } from '@tuturuuu/utils/name-helper';
import { motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface TeamData {
  id: string;
  name: string;
  description?: string;
  goals?: string;
  members: {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    individual_score: number;
    contribution_percentage: number;
    join_date?: string;
  }[];
  rank?: number;
  total_score?: number;
  challenge_scores?: Record<string, number>;
  challenge_details?: Array<{
    id: string;
    title: string;
    score: number;
  }>;
  stats?: {
    active_since?: string;
    average_member_score: number;
    weekly_progress?: number;
  };
}

export default function TeamClient({
  teamData,
}: {
  teamData: TeamData | null;
}) {
  const locale = useLocale();
  const t = useTranslations('nova.profile-team-page');
  console.log('team', teamData);
  if (!teamData) {
    return (
      <div className="container max-w-6xl py-16 text-center">
        <h2 className="text-2xl font-semibold">{t('not-found')}</h2>
        <p className="text-muted-foreground mt-2">
          {t('not-found-description')}
        </p>
        <Button className="mt-4" asChild>
          <Link href="/teams">{t('view-all-teams')}</Link>
        </Button>
      </div>
    );
  }
  const teamInfo = {
    ...teamData,
    name: teamData.name,
  };

  const nova_infor = {
    description: teamData.description,
    goals: teamData.goals,
  };

  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const supabase = createClient();
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    type: 'goals' | 'reports' | 'des';
    isEditing: boolean;
  }>({
    isOpen: false,
    type: 'goals',
    isEditing: false,
  });

  // Use either stats.active_since or the root active_since property
  const activeSinceDate = teamData.stats?.active_since || '';

  const formattedActiveDate = activeSinceDate
    ? (() => {
        try {
          const date = new Date(activeSinceDate);

          // Check if date is valid before formatting
          if (isNaN(date.getTime())) {
            return 'Unknown';
          }

          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
        } catch (error) {
          console.error('Error formatting date:', error);
          return 'Unknown';
        }
      })()
    : 'Unknown';

  const isTeamMember =
    user?.id && teamData.members.some((member) => member.user_id === user?.id);
  const openDialog = (type: 'goals' | 'reports' | 'des') => {
    setDialogState({ isOpen: true, type, isEditing: false });
  };

  const closeDialog = () => {
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    fetchUser();
  }, [supabase.auth]);
  // Share functionality
  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: `${teamInfo?.name} Team | Nova`,
          text: `Check out ${teamInfo?.name} team on Nova!`,
          url: window.location.href,
        })
        .catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Team stats
  const teamStats = {
    totalMembers: teamData.members.length,
  };

  return (
    <div className="container max-w-6xl pb-16 pt-8">
      {/* Breadcrumb navigation */}
      <nav className="text-muted-foreground mb-8 flex items-center space-x-2 text-sm">
        <Link href="/home" className="hover:text-foreground">
          {t('breadcrumb.home')}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/teams" className="hover:text-foreground">
          {t('breadcrumb.teams')}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">{teamInfo?.name}</span>
      </nav>

      {/* Team Header */}
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
                className="from-primary/30 to-primary/10 bg-linear-to-br absolute -inset-0.5 rounded-full blur-md"
              />
              <Avatar className="border-background h-24 w-24 border-2 shadow-md">
                <AvatarImage src={undefined} />
                <AvatarFallback className="text-xl">
                  {getInitials(teamInfo?.name || '')}
                </AvatarFallback>
              </Avatar>

              {/* Dynamic rank badge */}
              <div className="bg-linear-to-r absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full from-amber-500 to-yellow-400 text-xs font-bold text-white shadow-lg">
                #{teamData.rank || '?'}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold">{teamInfo?.name}</h1>
                <Badge variant="outline" className="bg-card">
                  <Users className="mr-1 h-3.5 w-3.5 text-blue-500" />
                  {teamStats.totalMembers} {t('members')}
                </Badge>
                +
                {teamData.rank && (
                  <Badge className="bg-linear-to-r from-amber-500 to-yellow-400 text-white">
                    <Trophy className="mr-1 h-3.5 w-3.5" />
                    {teamData.rank <= 20
                      ? 'Top 15%'
                      : `${t('rank')} #${teamData.rank}`}
                  </Badge>
                )}
              </div>

              {/* Display description if available */}
              {nova_infor.description && (
                <p className="text-muted-foreground mt-2">
                  {nova_infor.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 self-end sm:self-center">
            {isTeamMember && (
              <Button
                variant="outline"
                onClick={() =>
                  setDialogState({
                    isOpen: true,
                    type: 'des',
                    isEditing: true,
                  })
                }
              >
                {t('edit-profile')}
              </Button>
            )}
            <Link href={'/leaderboard'}>
              <Button variant="outline">
                <Trophy className="mr-1.5 h-4 w-4" />
                {t('view-leaderboard')}
              </Button>
            </Link>
            <Button
              variant="secondary"
              className="flex items-center gap-1"
              onClick={handleShare}
            >
              {copied ? `${t('copied')}` : `${t('share')}`}
              <Share2 className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Team Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-8 grid w-full grid-cols-3">
          <TabsTrigger value="overview">{t('overview-tab.title')}</TabsTrigger>
          <TabsTrigger value="members">{t('members-tab.name')}</TabsTrigger>
          <TabsTrigger value="activity">{t('activity-tab.name')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-8">
          {/* Simple rank card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="dark:via-background bg-linear-to-br rounded-xl border from-amber-50 via-white to-amber-50 p-6 shadow-sm dark:from-amber-950/20 dark:to-amber-950/20"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-xl font-semibold">
                  <Award className="h-5 w-5 text-amber-500" />

                  {t('overview-tab.team-rank')}
                </h3>
                <p className="text-muted-foreground mt-1">
                  {teamData.rank && teamData.rank <= 50
                    ? `${t('overview-tab.top-performers')}`
                    : `${t('overview-tab.competing')}`}
                </p>
              </div>

              <div className="flex items-center space-x-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-amber-500">
                    #{teamData.rank || '?'}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {t('overview-tab.rank-label')}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-500">
                    {teamData.total_score?.toFixed(1) || 0}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {t('overview-tab.points')}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Challenge Scoring Breakdown */}
          {teamData.challenge_details &&
            teamData.challenge_details.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mb-6"
              >
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Trophy className="h-5 w-5 text-purple-500" />
                      {t('overview-tab.challenge-breakdown')}
                    </CardTitle>
                    <CardDescription>
                      {t('overview-tab.breakdown-description')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Score Distribution Visualization */}
                    <div className="bg-card/50 mb-6 flex flex-col gap-2 rounded-lg border p-4">
                      <div className="text-base font-medium">
                        {t('overview-tab.score-distribution')}
                      </div>
                      <div className="flex h-8 w-full overflow-hidden rounded-lg">
                        {teamData.challenge_details.map((challenge, index) => {
                          const percentage = teamData.total_score
                            ? (challenge.score / teamData.total_score) * 100
                            : 0;

                          // Generate gradient colors for segments
                          const colors = [
                            'from-blue-500 to-blue-600',
                            'from-purple-500 to-purple-600',
                            'from-indigo-500 to-indigo-600',
                            'from-sky-500 to-sky-600',
                            'from-emerald-500 to-emerald-600',
                          ];

                          const colorClass = colors[index % colors.length];

                          return (
                            <motion.div
                              key={challenge.id}
                              className={`bg-linear-to-r relative h-full ${colorClass}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{
                                duration: 0.7,
                                delay: 0.3 + index * 0.1,
                              }}
                              title={`${challenge.title}: ${challenge.score.toFixed(1)} pts (${percentage.toFixed(1)}%)`}
                            />
                          );
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {teamData.challenge_details.map((challenge, index) => {
                          // Use same colors as above
                          const colors = [
                            'bg-blue-500',
                            'bg-purple-500',
                            'bg-indigo-500',
                            'bg-sky-500',
                            'bg-emerald-500',
                          ];

                          const bgColorClass = colors[index % colors.length];

                          return (
                            <div
                              key={challenge.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <div
                                className={`h-3 w-3 rounded-full ${bgColorClass}`}
                              />
                              <span>{challenge.title}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Challenge Details */}
                    <div className="space-y-6">
                      <div className="text-muted-foreground flex justify-between border-b pb-2 text-sm font-medium">
                        <span>{t('overview-tab.challenge')}</span>
                        <div className="flex gap-8">
                          <span>{t('overview-tab.score')}</span>
                          <span>{t('overview-tab.contribution')}</span>
                        </div>
                      </div>
                      {teamData.challenge_details.map((challenge, index) => {
                        // Calculate percentage of total score
                        const percentage = teamData.total_score
                          ? (challenge.score / teamData.total_score) * 100
                          : 0;

                        return (
                          <motion.div
                            key={challenge.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.3,
                              delay: 0.1 + index * 0.05,
                            }}
                            className="group space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium transition-colors group-hover:text-blue-600">
                                  {challenge.title}
                                </h4>
                              </div>
                              <div className="flex items-center gap-8">
                                <Badge
                                  variant="outline"
                                  className="min-w-[70px] justify-center border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                                >
                                  {challenge.score.toFixed(1)} {t('pts')}
                                </Badge>
                                <span className="min-w-[70px] text-right font-medium text-purple-600 dark:text-purple-400">
                                  {percentage.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                              <motion.div
                                className="bg-linear-to-r absolute left-0 h-full rounded-full from-blue-500 to-purple-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${percentage}%` }}
                                transition={{
                                  duration: 0.5,
                                  delay: 0.2 + index * 0.05,
                                }}
                              />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-background/80 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Info className="h-5 w-5 text-blue-500" />
                  {t('overview-tab.team-stats')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    {t('overview-tab.total-members')}
                  </span>
                  <span className="font-medium">{teamStats.totalMembers}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    {t('overview-tab.active-since')}
                  </span>
                  <span className="font-medium">{formattedActiveDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    {t('overview-tab.activity-status')}
                  </span>
                  <Badge
                    variant="outline"
                    className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  >
                    {t('overview-tab.active')}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-background/80 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Star className="h-5 w-5 text-amber-500" />
                  {t('overview-tab.quick-actions')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openDialog('des')}
                >
                  <Info className="mr-2 h-4 w-4 text-blue-500" />
                  {t('overview-tab.team-description')}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openDialog('goals')}
                >
                  <Target className="mr-2 h-4 w-4 text-green-500" />
                  {t('overview-tab.view-team-goals')}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Performance Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Award className="h-5 w-5 text-blue-500" />
                  {t('overview-tab.performance-metrics')}
                </CardTitle>
                <CardDescription>
                  {t('overview-tab.performance-description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-3">
                  {/* Average Member Score */}
                  <div className="bg-card/50 flex flex-col rounded-lg border p-4">
                    <span className="text-muted-foreground mb-1 text-xs font-medium">
                      {t('overview-tab.average-member-score')}
                    </span>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-blue-600">
                        {teamData.stats?.average_member_score?.toFixed(1) ||
                          '0'}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {t('overview-tab.points')}
                      </span>
                    </div>
                    <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <motion.div
                        className="h-full bg-blue-500"
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(100, teamData.stats?.average_member_score ? (teamData.stats.average_member_score / 10) * 100 : 0)}%`,
                        }}
                        transition={{ duration: 0.7, delay: 0.4 }}
                      />
                    </div>
                  </div>

                  {/* Weekly Activity */}
                  <div className="bg-card/50 flex flex-col rounded-lg border p-4">
                    <span className="text-muted-foreground mb-1 text-xs font-medium">
                      {t('overview-tab.weekly-progress')}
                    </span>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-green-600">
                        {teamData.stats?.weekly_progress?.toFixed(1) || '0'}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {t('overview-tab.points-this-week')}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                      >
                        {teamData.stats?.weekly_progress &&
                        teamData.stats.weekly_progress > 0
                          ? `${t('overview-tab.active')}`
                          : `${t('overview-tab.inactive')}`}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {t('overview-tab.last-7-days')}
                      </span>
                    </div>
                  </div>

                  {/* Top Contributor */}
                  <div className="bg-card/50 flex flex-col rounded-lg border p-4">
                    <span className="text-muted-foreground mb-1 text-xs font-medium">
                      {t('overview-tab.top-contributor')}
                    </span>
                    {teamData.members?.length > 0 && (
                      <>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage
                              src={teamData?.members?.[0]?.avatar_url || ''}
                            />
                            <AvatarFallback className="text-xs">
                              {getInitials(
                                teamData?.members?.[0]?.display_name || ''
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">
                            {teamData?.members?.[0]?.display_name || ''}
                          </span>
                        </div>
                        <div className="mt-2 flex items-end gap-2">
                          <span className="text-2xl font-bold text-purple-600">
                            {teamData?.members?.[0]?.individual_score?.toFixed(
                              1
                            ) || '0'}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            {t('overview-tab.points')}
                          </span>
                        </div>
                        <div className="text-muted-foreground mt-1 text-xs">
                          {teamData?.members?.[0]?.contribution_percentage?.toFixed(
                            1
                          ) || '0'}
                          {t('overview-tab.of-team-score')}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Members Tab - Enhanced with animations */}
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>{t('members-tab.team-members')}</CardTitle>
              <CardDescription>
                {t('members-tab.members-description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {teamData.members.map((member, index) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    key={member.user_id}
                    className="hover:bg-muted/50 group flex flex-col gap-4 rounded-lg border p-4 transition-all hover:shadow-md sm:flex-row sm:items-center"
                  >
                    <Link
                      href={`/profile/${member.user_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4"
                    >
                      <Avatar className="border-border h-12 w-12 border">
                        <AvatarImage src={member.avatar_url || ''} />
                        <AvatarFallback>
                          {getInitials(member.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium transition-colors group-hover:text-blue-600">
                            {member.display_name ||
                              generateFunName({ id: member.user_id, locale })}
                          </p>
                          {index === 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {t('members-tab.team-lead')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {t('members-tab.joined')}{' '}
                          {member.join_date
                            ? new Date(member.join_date).toLocaleDateString(
                                'en-US',
                                {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                }
                              )
                            : 'Unknown'}
                        </p>
                      </div>
                    </Link>

                    <div className="mt-2 flex flex-col gap-4 sm:ml-auto sm:mt-0 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                          {member.individual_score.toFixed(1)} {t('pts')}
                        </div>
                        <div className="rounded-md bg-purple-50 px-2.5 py-1 text-sm font-medium text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                          {member.contribution_percentage}
                          {t('members-tab.contribution-percentage')}
                        </div>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 sm:w-32 dark:bg-gray-800">
                        <motion.div
                          className="bg-linear-to-r h-full from-blue-500 to-purple-500"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${member.contribution_percentage}%`,
                          }}
                          transition={{
                            duration: 0.6,
                            delay: 0.2 + index * 0.05,
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>{t('activity-tab.team-activity')}</CardTitle>
              <CardDescription>
                {t('activity-tab.activity-description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {teamData.stats?.weekly_progress !== undefined ? (
                <div className="space-y-8">
                  {/* Performance Summary */}
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="bg-card flex flex-col items-center justify-center rounded-lg border p-4 text-center shadow-sm">
                      <div className="text-muted-foreground mb-1 text-sm">
                        {t('activity-tab.team-average')}
                      </div>
                      <div className="text-2xl font-bold text-blue-600">
                        {teamData.stats.average_member_score.toFixed(1)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t('activity-tab.points-per-member')}
                      </div>
                    </div>

                    <div className="bg-card flex flex-col items-center justify-center rounded-lg border p-4 text-center shadow-sm">
                      <div className="text-muted-foreground mb-1 text-sm">
                        {t('activity-tab.weekly-activity')}
                      </div>
                      <div className="text-2xl font-bold text-green-600">
                        {teamData.stats.weekly_progress?.toFixed(1) || 0}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t('activity-tab.points-this-week')}
                      </div>
                    </div>

                    <div className="bg-card flex flex-col items-center justify-center rounded-lg border p-4 text-center shadow-sm">
                      <div className="text-muted-foreground mb-1 text-sm">
                        {t('activity-tab.top-member')}
                      </div>
                      <div className="text-2xl font-bold text-purple-600">
                        {teamData.members[0]?.individual_score.toFixed(1) || 0}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t('activity-tab.points-by')}{' '}
                        {teamData.members[0]?.display_name}
                      </div>
                    </div>
                  </div>

                  {/* Member Contribution Chart */}
                  <div className="bg-card rounded-lg border p-6 shadow-sm">
                    <h3 className="mb-4 text-lg font-medium">
                      {t('activity-tab.member-contributions')}
                    </h3>
                    <div className="space-y-4">
                      {teamData.members.map((member, index) => (
                        <motion.div
                          key={member.user_id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: 0.05 * index }}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={member.avatar_url || ''} />
                                <AvatarFallback className="text-xs">
                                  {getInitials(member.display_name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">
                                {member.display_name}
                              </span>
                            </div>
                            <span className="text-muted-foreground text-sm">
                              {member.individual_score.toFixed(1)} pts (
                              {member.contribution_percentage}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                            <motion.div
                              className="bg-linear-to-r h-full rounded-full from-blue-500 to-purple-500"
                              initial={{ width: 0 }}
                              animate={{
                                width: `${member.contribution_percentage}%`,
                              }}
                              transition={{
                                duration: 0.5,
                                delay: 0.1 + 0.05 * index,
                              }}
                            />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Challenge Performance */}
                  {teamData.challenge_details &&
                    teamData.challenge_details.length > 0 && (
                      <div className="bg-card rounded-lg border p-6 shadow-sm">
                        <h3 className="mb-4 text-lg font-medium">
                          {t('activity-tab.challenge-performance')}
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {teamData.challenge_details
                            .slice(0, 4)
                            .map((challenge, index) => (
                              <motion.div
                                key={challenge.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: 0.3,
                                  delay: 0.05 * index,
                                }}
                                className="hover:bg-muted/50 flex flex-col rounded-lg border p-4 transition-colors"
                              >
                                <div className="text-md font-medium">
                                  {challenge.title}
                                </div>
                                <div className="text-muted-foreground mb-2 text-sm">
                                  {(
                                    (challenge.score /
                                      (teamData.total_score || 1)) *
                                    100
                                  ).toFixed(1)}
                                  {t('activity-tab.of-total-score')}
                                </div>
                                <div className="text-xl font-bold text-blue-600">
                                  {challenge.score.toFixed(1)}
                                </div>
                              </motion.div>
                            ))}
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <div className="text-muted-foreground flex h-24 items-center justify-center">
                  {t('activity-tab.no-activity')}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <TeamActionDialog
        isOpen={dialogState.isOpen}
        onClose={closeDialog}
        type={dialogState.type}
        initialData={nova_infor}
        isEditing={dialogState.isEditing}
      />
    </div>
  );
}
