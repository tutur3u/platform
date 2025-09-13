'use client';

import type { User, UserPrivateDetails } from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { Database } from '@tuturuuu/types/supabase';
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
import {
  AlertCircle,
  Bot,
  CheckCircle,
  Copy,
  ExternalLink,
  Settings,
  Trash2,
  Users,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { getInitials } from '@tuturuuu/utils/name-helper';
import moment from 'moment';
import { useState } from 'react';

type DiscordIntegration =
  Database['public']['Tables']['discord_integrations']['Row'];
type DiscordGuildMember =
  Database['public']['Tables']['discord_guild_members']['Row'];

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

  const botInviteUrl = `https://discord.com/api/oauth2/authorize?client_id=1333464267004489801&permissions=274878024768&scope=bot%20applications.commands`;
  const supportedCommands = [
    {
      name: '/api',
      description: 'Get information about a random free, public API',
    },
    {
      name: '/shorten',
      description: 'Shorten a URL with optional custom slug',
    },
  ];

  if (!integration) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6">
        <FeatureSummary
          title="Discord Integration"
          description="Connect your Discord server to enable bot commands and workspace notifications"
        />

        <Separator className="my-6" />

        <div className="grid gap-6 md:grid-cols-2">
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

        {/* Bot Features */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Bot Features
            </CardTitle>
            <CardDescription>
              Available commands and features once connected
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {supportedCommands.map((command) => (
                <div key={command.name} className="rounded-lg border p-3">
                  <code className="rounded bg-dynamic-muted/30 px-2 py-1 font-mono text-dynamic-blue text-sm">
                    {command.name}
                  </code>
                  <p className="mt-2 text-dynamic-muted-foreground text-sm">
                    {command.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Integration Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-dynamic-green" />
              Connected
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="font-medium text-sm">Guild ID</Label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded bg-dynamic-muted/30 px-2 py-1 font-mono text-sm">
                  {integration.discord_guild_id}
                </code>
                <Button variant="ghost" size="sm" onClick={copyGuildId}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="font-medium text-sm">Connected</Label>
              <p className="mt-1 text-dynamic-muted-foreground text-sm">
                {moment(integration.created_at).format(
                  'MMM DD, YYYY [at] HH:mm'
                )}
              </p>
            </div>

            <div>
              <Label className="font-medium text-sm">Created by</Label>
              <p className="mt-1 text-dynamic-muted-foreground text-sm">
                {integration.creator_id === user.id ? 'You' : 'Another member'}
              </p>
            </div>

            <Separator />

            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Disconnect
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
          </CardContent>
        </Card>

        {/* Bot Commands */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Available Commands
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {supportedCommands.map((command) => (
              <div key={command.name} className="rounded-lg border p-3">
                <code className="rounded bg-dynamic-muted/30 px-2 py-1 font-mono text-dynamic-blue text-sm">
                  {command.name}
                </code>
                <p className="mt-2 text-dynamic-muted-foreground text-sm">
                  {command.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Guild Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Guild Members
              {guildMembers && (
                <Badge variant="secondary">{guildMembers.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {guildMembers && guildMembers.length > 0 ? (
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {guildMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 rounded-lg border p-2"
                  >
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
                      <p className="truncate font-medium text-sm">
                        {member.users?.display_name || `Discord User`}
                      </p>
                      <p className="text-dynamic-muted-foreground text-xs">
                        ID: {member.discord_user_id.slice(-8)}...
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Linked
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-dynamic-muted-foreground">
                <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">No linked members found</p>
                <p className="mt-1 text-xs">
                  Members will appear here when they use bot commands
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Management Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Management</CardTitle>
          <CardDescription>
            Manage your Discord integration and bot permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <a href={botInviteUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Reinvite Bot
              </a>
            </Button>

            <Button asChild variant="outline">
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Discord Developer Portal
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Alert>
        <Bot className="h-4 w-4" />
        <AlertDescription>
          <strong>Getting started:</strong> Use slash commands in your Discord
          server to interact with the bot. Type <code>/</code> in any channel to
          see available commands.
        </AlertDescription>
      </Alert>
    </div>
  );
}
