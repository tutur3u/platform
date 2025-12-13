'use client';

import { AlertCircle, CheckCircle2, Eye, EyeOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useState } from 'react';

interface MigrationConfigProps {
  apiEndpoint: string;
  apiKey: string;
  workspaceId: string;
  healthCheckMode: boolean;
  workspaceName: string | null;
  loadingWorkspaceName: boolean;
  onApiEndpointChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onWorkspaceIdChange: (value: string) => void;
  onHealthCheckModeChange: (value: boolean) => void;
}

export function MigrationConfig({
  apiEndpoint,
  apiKey,
  workspaceId,
  healthCheckMode,
  workspaceName,
  loadingWorkspaceName,
  onApiEndpointChange,
  onApiKeyChange,
  onWorkspaceIdChange,
  onHealthCheckModeChange,
}: MigrationConfigProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Migration Configuration</CardTitle>
        <CardDescription>
          Configure your external API connection and target workspace for data
          migration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
          <Label
            htmlFor="health-check-mode"
            className="cursor-pointer font-normal text-sm"
          >
            Health Check Mode (limits to 1001 entries per module for quick
            verification)
          </Label>
          <Switch
            id="health-check-mode"
            checked={healthCheckMode}
            onCheckedChange={onHealthCheckModeChange}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="api-endpoint">
              API Endpoint <span className="text-dynamic-red">*</span>
            </Label>
            <Input
              id="api-endpoint"
              placeholder="https://example.com/api/v1"
              value={apiEndpoint}
              onChange={(e) => onApiEndpointChange(e.currentTarget.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">
              API Key <span className="text-dynamic-red">*</span>
            </Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showApiKey ? 'text' : 'password'}
                placeholder="Enter your API key"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.currentTarget.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-0 right-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
                tabIndex={-1}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-id">
              Workspace ID <span className="text-dynamic-red">*</span>
            </Label>
            <div className="space-y-1">
              <Input
                id="workspace-id"
                placeholder="Enter workspace ID"
                value={workspaceId}
                onChange={(e) => onWorkspaceIdChange(e.currentTarget.value)}
              />
              {workspaceId && (
                <div className="flex items-center gap-2 text-xs">
                  {loadingWorkspaceName || workspaceName === null ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                      Loading workspace...
                    </span>
                  ) : workspaceName !== '' ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      {workspaceName}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      Workspace not found
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
