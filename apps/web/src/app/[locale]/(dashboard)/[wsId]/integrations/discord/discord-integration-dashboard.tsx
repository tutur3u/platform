'use client';

import {
  AlertCircle,
  Bot,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserMinus,
  Users,
} from '@tuturuuu/icons';
import type { Database, User, UserPrivateDetails } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
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
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { getInitials } from '@tuturuuu/utils/name-helper';
import moment from 'moment';
import { useCallback, useEffect, useState } from 'react';

type DiscordIntegration =
  Database['public']['Tables']['discord_integrations']['Row'];
type DiscordGuildMember =
  Database['public']['Tables']['discord_guild_members']['Row'];

interface WorkspaceMember {
  user_id: string;
  created_at: string;
  users: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    handle: string | null;
  } | null;
}

interface Props {
  wsId: string;
  user: (User & UserPrivateDetails) | WorkspaceUser;
  integration: DiscordIntegration | null;
  guildMembers:
    | (DiscordGuildMember & {
        users: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          handle: string | null;
        } | null;
      })[]
    | null;
}

export default function DiscordIntegrationDashboard({
  wsId,
  user,
  integration,
  guildMembers,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [guildId, setGuildId] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Member management state
  const [members, setMembers] = useState(guildMembers || []);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [availableMembers, setAvailableMembers] = useState<WorkspaceMember[]>(
    []
  );
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isRemovingMember, setIsRemovingMember] = useState<string | null>(null);

  // Discord user ID input state
  const [showDiscordIdDialog, setShowDiscordIdDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(
    null
  );
  const [discordUserId, setDiscordUserId] = useState('');

  const handleConnectDiscord = async () => {
    if (!guildId.trim()) {
      toast.error('Please enter a Discord Guild ID');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/integrations/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsId,
          discordGuildId: guildId.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to connect Discord integration');
      }

      toast.success('Discord integration connected successfully!');
      window.location.reload();
    } catch (error) {
      console.error('Discord connection error:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to connect Discord integration'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectDiscord = async () => {
    if (!integration) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/integrations/discord', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsId,
          integrationId: integration.id,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to disconnect Discord integration');
      }

      toast.success('Discord integration disconnected successfully!');
      window.location.reload();
    } catch (error) {
      console.error('Discord disconnection error:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to disconnect Discord integration'
      );
    } finally {
      setIsLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const copyGuildId = () => {
    if (integration) {
      navigator.clipboard.writeText(integration.discord_guild_id);
      toast.success('Guild ID copied to clipboard');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // Member management functions
  const searchAvailableMembers = useCallback(
    async (query: string) => {
      if (!integration) return;

      setIsSearchingMembers(true);
      try {
        const params = new URLSearchParams({
          wsId,
          discordGuildId: integration.discord_guild_id,
          query: query.trim(),
        });

        const response = await fetch(
          `/api/v1/integrations/discord/available-members?${params}`
        );

        if (!response.ok) {
          throw new Error('Failed to search members');
        }

        const { data } = await response.json();
        setAvailableMembers(data || []);
      } catch (error) {
        console.error('Error searching members:', error);
        toast.error('Failed to search members');
      } finally {
        setIsSearchingMembers(false);
      }
    },
    [wsId, integration]
  );

  const handleAddMember = (workspaceMember: WorkspaceMember) => {
    if (!integration || !workspaceMember.users) return;

    setSelectedMember(workspaceMember);
    setDiscordUserId('');
    setShowDiscordIdDialog(true);
  };

  const handleConfirmAddMember = async () => {
    if (!integration || !selectedMember?.users) return;

    if (!discordUserId.trim()) {
      toast.error('Discord User ID is required');
      return;
    }

    // Validate Discord User ID format (should be a numeric string)
    if (!/^\d{17,19}$/.test(discordUserId.trim())) {
      toast.error(
        'Invalid Discord User ID format. Please enter a valid Discord User ID (17-19 digits)'
      );
      return;
    }

    setIsAddingMember(true);
    try {
      const response = await fetch('/api/v1/integrations/discord/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsId,
          discordGuildId: integration.discord_guild_id,
          platformUserId: selectedMember.users.id,
          discordUserId: discordUserId.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add member');
      }

      const { data: newMember } = await response.json();
      setMembers((prev) => [newMember, ...prev]);
      setAvailableMembers((prev) =>
        prev.filter((m) => m.user_id !== selectedMember.user_id)
      );
      toast.success('Member added successfully');
      setShowDiscordIdDialog(false);
      setSelectedMember(null);
      setDiscordUserId('');
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to add member'
      );
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!integration) return;

    setIsRemovingMember(memberId);
    try {
      const response = await fetch('/api/v1/integrations/discord/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsId,
          discordGuildId: integration.discord_guild_id,
          memberId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove member');
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success('Member removed successfully');
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to remove member'
      );
    } finally {
      setIsRemovingMember(null);
    }
  };

  // Search members when dialog opens or query changes
  useEffect(() => {
    if (showAddMemberDialog && integration) {
      searchAvailableMembers(memberSearchQuery);
    }
  }, [
    showAddMemberDialog,
    memberSearchQuery,
    searchAvailableMembers,
    integration,
  ]);

  const botInviteUrl = `https://discord.com/api/oauth2/authorize?client_id=1333464267004489801&permissions=274878024768&scope=bot%20applications.commands`;

  if (!integration) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6">
        <FeatureSummary
          title="Discord Integration"
          description="Connect your Discord server to enable bot commands and workspace notifications"
        />

        <Separator className="my-6" />

        <div className="grid gap-6">
          {/* Setup Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-dynamic-blue" />
                Setup Instructions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <h4 className="mb-2 font-medium text-sm">
                    1. Invite the Bot
                  </h4>
                  <p className="mb-2 text-dynamic-muted-foreground text-sm">
                    First, invite our Discord bot to your server:
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={botInviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Invite Bot to Discord
                    </a>
                  </Button>
                </div>

                <div>
                  <h4 className="mb-2 font-medium text-sm">2. Get Guild ID</h4>
                  <p className="text-dynamic-muted-foreground text-sm">
                    Enable Developer Mode in Discord, right-click your server,
                    and select "Copy Server ID"
                  </p>
                </div>

                <div>
                  <h4 className="mb-2 font-medium text-sm">
                    3. Connect Integration
                  </h4>
                  <p className="text-dynamic-muted-foreground text-sm">
                    Enter your Discord Guild ID below to complete the setup
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Connection Form */}
          <Card>
            <CardHeader>
              <CardTitle>Connect Discord Server</CardTitle>
              <CardDescription>
                Enter your Discord Guild ID to connect your server
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="guild-id">Discord Guild ID</Label>
                <Input
                  id="guild-id"
                  placeholder="e.g., 1234567890123456789"
                  value={guildId}
                  onChange={(e) => setGuildId(e.target.value)}
                />
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Make sure the bot has been invited to your Discord server with
                  the required permissions before connecting.
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleConnectDiscord}
                disabled={isLoading || !guildId.trim()}
                className="w-full"
              >
                {isLoading ? 'Connecting...' : 'Connect Integration'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6">
      <FeatureSummary
        title="Discord Integration"
        description={`Connected to Discord server • Guild ID: ${integration.discord_guild_id}`}
      />

      <Separator className="my-6" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Integration Status */}
        <Card className="overflow-hidden border-dynamic-green/20 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-green/20 border-b bg-linear-to-r from-dynamic-green/5 to-dynamic-blue/5 p-4">
            <CardTitle className="flex items-center gap-2 font-semibold text-base">
              <div className="rounded-lg bg-dynamic-green/10 p-1.5 text-dynamic-green">
                <CheckCircle className="h-4 w-4" />
              </div>
              <div className="line-clamp-1">Connected</div>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-full space-y-6 p-6">
            <div className="space-y-4">
              <div>
                <Label className="font-medium text-dynamic-foreground text-sm">
                  Guild ID
                </Label>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-dynamic-border/10 bg-dynamic-muted/5 p-3">
                  <code className="flex-1 font-mono text-dynamic-foreground text-sm">
                    {integration.discord_guild_id}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyGuildId}
                    className="h-8 w-8 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-dynamic-border/10 bg-dynamic-muted/5 p-3">
                  <Label className="font-medium text-dynamic-muted-foreground text-sm">
                    Connected
                  </Label>
                  <p className="mt-1 font-medium text-dynamic-foreground text-sm">
                    {moment(integration.created_at).format('MMM DD, YYYY')}
                  </p>
                </div>

                <div className="rounded-lg border border-dynamic-border/10 bg-dynamic-muted/5 p-3">
                  <Label className="font-medium text-dynamic-muted-foreground text-sm">
                    Created by
                  </Label>
                  <p className="mt-1 font-medium text-dynamic-foreground text-sm">
                    {integration.creator_id === user.id
                      ? 'You'
                      : 'Another member'}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Dialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full transition-all duration-200 hover:scale-[1.02]"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Disconnect Integration
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Disconnect Discord Integration</DialogTitle>
                    <DialogDescription>
                      This will remove the connection between your workspace and
                      Discord server. The bot will remain in your Discord server
                      but won't respond to commands.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="ghost"
                      onClick={() => setShowDeleteDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDisconnectDiscord}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Disconnecting...' : 'Disconnect'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Guild Members */}
        <Card className="overflow-hidden border-dynamic-blue/20 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-blue/20 border-b bg-linear-to-r from-dynamic-blue/5 to-dynamic-purple/5 p-4">
            <CardTitle className="flex items-center gap-2 font-semibold text-base">
              <div className="rounded-lg bg-dynamic-blue/10 p-1.5 text-dynamic-blue">
                <Users className="h-4 w-4" />
              </div>
              <div className="line-clamp-1">Guild Members</div>
              {members && (
                <Badge variant="secondary" className="ml-2">
                  {members.length}
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 transition-colors hover:bg-dynamic-blue/10 hover:text-dynamic-blue"
              onClick={() => setShowAddMemberDialog(true)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Member
            </Button>
          </CardHeader>
          <CardContent className="h-full space-y-6 p-6">
            {members && members.length > 0 ? (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border border-dynamic-border/10 bg-dynamic-muted/5 p-3 transition-all duration-200 hover:border-dynamic-blue/20 hover:bg-dynamic-blue/5"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={member.users?.avatar_url || undefined}
                        />
                        <AvatarFallback className="text-xs">
                          {getInitials(
                            member.users?.display_name ||
                              `User ${member.discord_user_id.slice(-4)}`
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-dynamic-foreground text-sm">
                          {member.users?.display_name || `Discord User`}
                        </p>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <p className="text-dynamic-muted-foreground text-xs">
                              <span className="font-medium">Platform ID:</span>
                            </p>
                            <div className="flex items-center gap-1 rounded bg-dynamic-muted/30 px-2 py-1">
                              <button
                                className="cursor-pointer border-none bg-transparent p-0 text-left font-mono text-xs transition-colors hover:text-dynamic-blue"
                                title={member.platform_user_id}
                                onClick={() =>
                                  copyToClipboard(
                                    member.platform_user_id,
                                    'Platform ID'
                                  )
                                }
                                type="button"
                              >
                                {member.platform_user_id.slice(0, 8)}...
                              </button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  copyToClipboard(
                                    member.platform_user_id,
                                    'Platform ID'
                                  )
                                }
                                className="h-4 w-4 p-0 hover:bg-dynamic-muted/50"
                                title="Copy full Platform ID"
                              >
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-dynamic-muted-foreground text-xs">
                              <span className="font-medium">Discord ID:</span>
                            </p>
                            <div className="flex items-center gap-1 rounded bg-dynamic-muted/30 px-2 py-1">
                              <code className="font-mono text-xs">
                                {member.discord_user_id}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  copyToClipboard(
                                    member.discord_user_id,
                                    'Discord ID'
                                  )
                                }
                                className="h-4 w-4 p-0 hover:bg-dynamic-muted/50"
                                title="Copy Discord ID"
                              >
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Linked
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red"
                        onClick={() => handleRemoveMember(member.id)}
                        disabled={isRemovingMember === member.id}
                      >
                        {isRemovingMember === member.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <UserMinus className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dynamic-gray/20 bg-linear-to-br from-dynamic-gray/10 to-dynamic-slate/10">
                  <Users className="h-8 w-8 text-dynamic-gray/60" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-base text-dynamic-gray">
                    No linked members found
                  </h3>
                  <p className="mx-auto max-w-xs text-dynamic-gray/60 text-sm">
                    Add workspace members to link them with Discord users
                  </p>
                </div>
                <div className="mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-dynamic-blue/20 text-dynamic-blue transition-all duration-200 hover:border-dynamic-blue/30 hover:bg-dynamic-blue/10"
                    onClick={() => setShowAddMemberDialog(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Member
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage Instructions */}
      <Alert>
        <Bot className="h-4 w-4" />
        <AlertDescription>
          <strong>Getting started:</strong> Use slash commands in your Discord
          server to interact with the bot. Type <code>/</code> in any channel to
          see available commands.
        </AlertDescription>
      </Alert>

      {/* Add Member Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-dynamic-blue" />
              Add Guild Member
            </DialogTitle>
            <DialogDescription>
              Search and add workspace members to link them with Discord users
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member-search">Search Members</Label>
              <div className="relative">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-dynamic-muted-foreground" />
                <Input
                  id="member-search"
                  placeholder="Search by name or handle..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="pl-10"
                />
                {isSearchingMembers && (
                  <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-dynamic-muted-foreground" />
                )}
              </div>
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {availableMembers.length > 0 ? (
                availableMembers.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between rounded-lg border border-dynamic-border/10 bg-dynamic-muted/5 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={member.users?.avatar_url || undefined}
                        />
                        <AvatarFallback className="text-xs">
                          {getInitials(
                            member.users?.display_name || 'Unknown User'
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-dynamic-foreground text-sm">
                          {member.users?.display_name || 'Unknown User'}
                        </p>
                        {member.users?.handle && (
                          <p className="text-dynamic-muted-foreground text-xs">
                            @{member.users.handle}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddMember(member)}
                      disabled={isAddingMember}
                      className="border-dynamic-blue/20 text-dynamic-blue hover:bg-dynamic-blue/10"
                    >
                      {isAddingMember ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-dynamic-muted-foreground">
                  <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">
                    {memberSearchQuery.trim()
                      ? 'No members found matching your search'
                      : 'No available members to add'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddMemberDialog(false);
                setMemberSearchQuery('');
                setAvailableMembers([]);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discord User ID Input Dialog */}
      <Dialog open={showDiscordIdDialog} onOpenChange={setShowDiscordIdDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-dynamic-blue" />
              Add Discord User
            </DialogTitle>
            <DialogDescription>
              Enter the Discord User ID for{' '}
              <span className="font-medium text-dynamic-foreground">
                {selectedMember?.users?.display_name || 'this user'}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="discord-user-id">Discord User ID</Label>
              <Input
                id="discord-user-id"
                placeholder="e.g., 123456789012345678"
                value={discordUserId}
                onChange={(e) => setDiscordUserId(e.target.value)}
                className="font-mono"
              />
              <p className="text-dynamic-muted-foreground text-xs">
                Enter a 17-19 digit Discord User ID
              </p>
            </div>

            <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-dynamic-blue/20">
                  <span className="text-dynamic-blue text-xs">💡</span>
                </div>
                <div className="flex-1 text-xs">
                  <p className="font-medium text-dynamic-blue">
                    How to get Discord User ID:
                  </p>
                  <ol className="mt-1 space-y-1 text-dynamic-blue/80">
                    <li>1. Enable Developer Mode in Discord Settings</li>
                    <li>2. Right-click on the user's name or avatar</li>
                    <li>3. Select "Copy User ID"</li>
                    <li>4. Paste it in the field above</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDiscordIdDialog(false);
                setSelectedMember(null);
                setDiscordUserId('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAddMember}
              disabled={isAddingMember || !discordUserId.trim()}
              className="bg-dynamic-blue text-white hover:bg-dynamic-blue/90"
            >
              {isAddingMember ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Member
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
