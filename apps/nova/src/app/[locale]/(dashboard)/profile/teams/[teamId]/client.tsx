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
  }[];
  rank?: number;
  total_score?: number;
}

export function TeamProfile({ teamData }: { teamData: TeamData | null }) {
  if (!teamData) {
    return (
      <div className="container max-w-6xl py-16 text-center">
        <h2 className="text-2xl font-semibold">Team not found</h2>
        <p className="text-muted-foreground mt-2">
          The requested team could not be loaded.
        </p>
        <Button className="mt-4" asChild>
          <Link href="/teams">View All Teams</Link>
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
          Home
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/teams" className="hover:text-foreground">
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
                <Badge className="bg-gradient-to-r from-amber-500 to-yellow-400 text-white">
                  <Trophy className="mr-1 h-3.5 w-3.5" />
                  Top 15%
                </Badge>
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
            <Link href={'/leaderboard'}>
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
                  This team is currently in the top performers
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
                    {teamData.total_score || 0}
                  </div>
                  <div className="text-muted-foreground text-sm">Points</div>
                </div>
              </div>
            </div>
          </motion.div>

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
                    Team Created
                  </span>
                  <span className="font-medium">Apr 2023</span>
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
        </TabsContent>

        {/* Members Tab - Enhanced with animations */}
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Active members and their roles in the team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {teamData.members.map((member, index) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    key={member.user_id}
                    className="hover:bg-muted/50 flex items-center space-x-4 rounded-lg border p-4 transition-all hover:shadow-md"
                  >
                    <Avatar className="border-border h-12 w-12 border">
                      <AvatarImage src={member.avatar_url || ''} />
                      <AvatarFallback>
                        {getInitials(member.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">
                        {member.display_name || generateFunName(member.user_id)}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {index === 0 ? 'Team Lead' : 'Member'}
                      </p>
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
              <CardDescription>Recent team actions and updates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground flex h-24 items-center justify-center">
                No recent activity
              </div>
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
