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
import { useLocale } from 'next-intl';
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
  active_since?: string;
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

export function TeamProfile({ teamData, wsId }: { teamData: TeamData | null, wsId: string }) {
  const locale = useLocale();

  if (!teamData) {
    return (
      <div className="container max-w-6xl py-16 text-center">
        <h2 className="text-2xl font-semibold">Team not found</h2>
        <p className="text-muted-foreground mt-2">
          The requested team could not be loaded.
        </p>
        <Button className="mt-4" asChild>
          <Link href={`/${wsId}/teams`}>View All Teams</Link>
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
  const activeSinceDate = teamData.stats?.active_since || teamData.active_since;

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
        <Link href={`/${wsId}/home`} className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href={`/${wsId}/teams`} className="hover:text-foreground">
          Teams
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
                className="from-primary/30 to-primary/10 absolute -inset-0.5 rounded-full bg-gradient-to-br blur-md"
              />
              <Avatar className="border-background h-24 w-24 border-2 shadow-md">
                <AvatarImage src={undefined} />
                <AvatarFallback className="text-xl">
                  {getInitials(teamInfo?.name || '')}
                </AvatarFallback>
              </Avatar>

              {/* Dynamic rank badge */}
              <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-xs font-bold text-white shadow-lg">
                #{teamData.rank || '?'}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold">{teamInfo?.name}</h1>
                <Badge variant="outline" className="bg-card">
                  <Users className="mr-1 h-3.5 w-3.5 text-blue-500" />
                  {teamStats.totalMembers} Members
                </Badge>
                +
                {teamData.rank && (
                  <Badge className="bg-gradient-to-r from-amber-500 to-yellow-400 text-white">
                    <Trophy className="mr-1 h-3.5 w-3.5" />
                    {teamData.rank <= 20 ? 'Top 15%' : `Rank #${teamData.rank}`}
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
                Edit Profile
              </Button>
            )}
            <Link href={`/${wsId}/leaderboard`}>
              <Button variant="outline">
                <Trophy className="mr-1.5 h-4 w-4" />
                View on Leaderboard
              </Button>
            </Link>
            <Button
              variant="secondary"
              className="flex items-center gap-1"
              onClick={handleShare}
            >
              {copied ? 'Copied!' : 'Share'}
              <Share2 className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Team Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-8 grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-8">
          {/* Simple rank card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="dark:via-background rounded-xl border bg-gradient-to-br from-amber-50 via-white to-amber-50 p-6 shadow-sm dark:from-amber-950/20 dark:to-amber-950/20"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-xl font-semibold">
                  <Award className="h-5 w-5 text-amber-500" />
                  Team Rank
                </h3>
                <p className="text-muted-foreground mt-1">
                  {teamData.rank && teamData.rank <= 50
                    ? 'This team is currently in the top performers'
                    : 'This team is competing in the leaderboard'}
                </p>
              </div>

              <div className="flex items-center space-x-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-amber-500">
                    #{teamData.rank || '?'}
                  </div>
                  <div className="text-muted-foreground text-sm">Rank</div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-500">
                    {teamData.total_score?.toFixed(1) || 0}
                  </div>
                  <div className="text-muted-foreground text-sm">Points</div>
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
                      Challenge Breakdown
                    </CardTitle>
                    <CardDescription>
                      Detailed breakdown of the team's performance in each
                      challenge
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Score Distribution Visualization */}
                    <div className="bg-card/50 mb-6 flex flex-col gap-2 rounded-lg border p-4">
                      <div className="text-base font-medium">
                        Score Distribution
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
                              className={`relative h-full bg-gradient-to-r ${colorClass}`}
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
                        <span>Challenge</span>
                        <div className="flex gap-8">
                          <span>Score</span>
                          <span>Contribution</span>
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
                                  {challenge.score.toFixed(1)} pts
                                </Badge>
                                <span className="min-w-[70px] text-right font-medium text-purple-600 dark:text-purple-400">
                                  {percentage.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                              <motion.div
                                className="absolute left-0 h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
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
                  Team Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Total Members
                  </span>
                  <span className="font-medium">{teamStats.totalMembers}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Active Since
                  </span>
                  <span className="font-medium">{formattedActiveDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Activity Status
                  </span>
                  <Badge
                    variant="outline"
                    className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  >
                    Active
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-background/80 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Star className="h-5 w-5 text-amber-500" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openDialog('des')}
                >
                  <Info className="mr-2 h-4 w-4 text-blue-500" />
                  Team Description
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openDialog('goals')}
                >
                  <Target className="mr-2 h-4 w-4 text-green-500" />
                  View Team Goals
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
                  Performance Metrics
                </CardTitle>
                <CardDescription>
                  Key performance indicators for this team
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-3">
                  {/* Average Member Score */}
                  <div className="bg-card/50 flex flex-col rounded-lg border p-4">
                    <span className="text-muted-foreground mb-1 text-xs font-medium">
                      Average Member Score
                    </span>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-blue-600">
                        {teamData.stats?.average_member_score?.toFixed(1) ||
                          '0'}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        points
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
                      Weekly Progress
                    </span>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-green-600">
                        {teamData.stats?.weekly_progress?.toFixed(1) || '0'}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        points this week
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                      >
                        {teamData.stats?.weekly_progress &&
                        teamData.stats.weekly_progress > 0
                          ? 'Active'
                          : 'Inactive'}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        Last 7 days
                      </span>
                    </div>
                  </div>

                  {/* Top Contributor */}
                  <div className="bg-card/50 flex flex-col rounded-lg border p-4">
                    <span className="text-muted-foreground mb-1 text-xs font-medium">
                      Top Contributor
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
                            points
                          </span>
                        </div>
                        <div className="text-muted-foreground mt-1 text-xs">
                          {teamData?.members?.[0]?.contribution_percentage?.toFixed(
                            1
                          ) || '0'}
                          % of team score
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
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Members and their contributions to the team's score
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
                    <div className="flex items-center gap-4">
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
                              Team Lead
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm">
                          Joined{' '}
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
                    </div>

                    <div className="mt-2 flex flex-col gap-4 sm:ml-auto sm:mt-0 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                          {member.individual_score.toFixed(1)} pts
                        </div>
                        <div className="rounded-md bg-purple-50 px-2.5 py-1 text-sm font-medium text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                          {member.contribution_percentage}% contribution
                        </div>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 sm:w-32 dark:bg-gray-800">
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
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
              <CardTitle>Team Activity</CardTitle>
              <CardDescription>
                Recent team performance and statistics
              </CardDescription>
            </CardHeader>
            <CardContent>
              {teamData.stats?.weekly_progress !== undefined ? (
                <div className="space-y-8">
                  {/* Performance Summary */}
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="bg-card flex flex-col items-center justify-center rounded-lg border p-4 text-center shadow-sm">
                      <div className="text-muted-foreground mb-1 text-sm">
                        Team Average
                      </div>
                      <div className="text-2xl font-bold text-blue-600">
                        {teamData.stats.average_member_score.toFixed(1)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        points per member
                      </div>
                    </div>

                    <div className="bg-card flex flex-col items-center justify-center rounded-lg border p-4 text-center shadow-sm">
                      <div className="text-muted-foreground mb-1 text-sm">
                        Weekly Activity
                      </div>
                      <div className="text-2xl font-bold text-green-600">
                        {teamData.stats.weekly_progress?.toFixed(1) || 0}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        points this week
                      </div>
                    </div>

                    <div className="bg-card flex flex-col items-center justify-center rounded-lg border p-4 text-center shadow-sm">
                      <div className="text-muted-foreground mb-1 text-sm">
                        Top Member
                      </div>
                      <div className="text-2xl font-bold text-purple-600">
                        {teamData.members[0]?.individual_score.toFixed(1) || 0}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        points by {teamData.members[0]?.display_name}
                      </div>
                    </div>
                  </div>

                  {/* Member Contribution Chart */}
                  <div className="bg-card rounded-lg border p-6 shadow-sm">
                    <h3 className="mb-4 text-lg font-medium">
                      Member Contributions
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
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
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
                          Challenge Performance
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
                                  % of total score
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
                  No recent activity data available
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
