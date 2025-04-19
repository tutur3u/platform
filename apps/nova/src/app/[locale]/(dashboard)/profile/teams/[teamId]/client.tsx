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
  ChevronRight,
  Info,
  Share2,
  Target,
  Trophy,
  Users,
} from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { generateFunName, getInitials } from '@tuturuuu/utils/name-helper';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface TeamMember {
  user_id: string;
  nova_teams: {
    id: string;
    name: string;
    goals?: string;
    description?: string;
  };
  users: {
    display_name: string;
    avatar_url: string | null;
  };
}

export function TeamProfile({ members }: { members: TeamMember[] }) {
  const teamInfo = members[0]?.nova_teams;
  const nova_infor = {
    description: members[0]?.nova_teams.description,
    goals: members[0]?.nova_teams.goals,
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
    user?.id && members.some((member) => member.user_id === user?.id);
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
    totalMembers: members.length,
  };

  return (
    <div className="container max-w-6xl pt-8 pb-16">
      {/* Breadcrumb navigation */}
      <nav className="mb-8 flex items-center space-x-2 text-sm text-muted-foreground">
        <Link href="/home" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/teams" className="hover:text-foreground">
          Teams
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="font-medium text-foreground">{teamInfo?.name}</span>
      </nav>

      {/* Team Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 overflow-hidden rounded-xl border bg-card/50 p-6 shadow-sm"
      >
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="relative">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 blur-md"
              />
              <Avatar className="h-24 w-24 border-2 border-background shadow-md">
                <AvatarImage src={undefined} />
                <AvatarFallback className="text-xl">
                  {getInitials(teamInfo?.name || '')}
                </AvatarFallback>
              </Avatar>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold">{teamInfo?.name}</h1>
                <Badge variant="outline" className="bg-card">
                  <Users className="mr-1 h-3.5 w-3.5 text-blue-500" />
                  {teamStats.totalMembers} Members
                </Badge>
              </div>

              {/* <div className="text-muted-foreground mt-1.5">
                {teamInfo?.description}
              </div> */}
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
                  <span className="text-sm text-muted-foreground">
                    Total Members
                  </span>
                  <span className="font-medium">{teamStats.totalMembers}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-background/80 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openDialog('des')}
                >
                  <Target className="mr-2 h-4 w-4" />
                  Description
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openDialog('goals')}
                >
                  <Target className="mr-2 h-4 w-4" />
                  View Team Goals
                </Button>
                {/* <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openDialog('reports')}
                >
                  <ScrollText className="mr-2 h-4 w-4" />
                  Team Reports
                </Button> */}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Members Tab */}
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
                {members.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center space-x-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={member.users?.avatar_url || ''} />
                      <AvatarFallback>
                        {getInitials(member.users.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">
                        {member.users.display_name ||
                          generateFunName(member.user_id)}
                      </p>
                    </div>
                  </div>
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
              <div className="flex h-24 items-center justify-center text-muted-foreground">
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
