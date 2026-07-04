'use client';

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Server,
} from '@tuturuuu/icons';
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
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';
import type { MigrationMode } from '../hooks/use-migration-state';

interface MigrationConfigProps {
  mode: MigrationMode;
  configLoading?: boolean; // True while loading from localStorage
  // Legacy mode
  legacyApiEndpoint: string;
  legacyApiKey: string;
  // Tuturuuu mode
  tuturuuuApiEndpoint: string;
  tuturuuuApiKey: string;
  sourceWorkspaceId: string;
  // Shared
  targetWorkspaceId: string;
  healthCheckMode: boolean;
  sourceWorkspaceName: string | null;
  loadingSourceWorkspaceName: boolean;
  targetWorkspaceName: string | null;
  loadingTargetWorkspaceName: boolean;
  onModeChange: (value: MigrationMode) => void;
  onLegacyApiEndpointChange: (value: string) => void;
  onLegacyApiKeyChange: (value: string) => void;
  onTuturuuuApiEndpointChange: (value: string) => void;
  onTuturuuuApiKeyChange: (value: string) => void;
  onSourceWorkspaceIdChange: (value: string) => void;
  onTargetWorkspaceIdChange: (value: string) => void;
  onHealthCheckModeChange: (value: boolean) => void;
}

export function MigrationConfig({
  mode,
  configLoading = false,
  legacyApiEndpoint,
  legacyApiKey,
  tuturuuuApiEndpoint,
  tuturuuuApiKey,
  sourceWorkspaceId,
  targetWorkspaceId,
  healthCheckMode,
  sourceWorkspaceName,
  loadingSourceWorkspaceName,
  targetWorkspaceName,
  loadingTargetWorkspaceName,
  onModeChange,
  onLegacyApiEndpointChange,
  onLegacyApiKeyChange,
  onTuturuuuApiEndpointChange,
  onTuturuuuApiKeyChange,
  onSourceWorkspaceIdChange,
  onTargetWorkspaceIdChange,
  onHealthCheckModeChange,
}: MigrationConfigProps) {
  const [showTuturuuuApiKey, setShowTuturuuuApiKey] = useState(false);
  const [showLegacyApiKey, setShowLegacyApiKey] = useState(false);

  // Loading skeleton component for input fields
  const InputSkeleton = () => (
    <div className="flex h-10 w-full items-center rounded-md border bg-muted/50 px-3">
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted-foreground/20" />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Migration Configuration</CardTitle>
            <CardDescription>
              {mode === 'tuturuuu'
                ? 'Migrate data from Tuturuuu production to your workspace'
                : 'Migrate data from a custom external API source'}
            </CardDescription>
          </div>
          <Tabs
            value={mode}
            onValueChange={(v) => onModeChange(v as MigrationMode)}
          >
            <TabsList>
              <TabsTrigger value="tuturuuu" className="gap-2">
                <Globe className="h-4 w-4" />
                Tuturuuu
              </TabsTrigger>
              <TabsTrigger value="legacy" className="gap-2">
                <Server className="h-4 w-4" />
                Legacy
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
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

        {mode === 'tuturuuu' ? (
          // Tuturuuu Mode Configuration
          <div className="space-y-4">
            <div className="rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/5 p-4">
              <p className="text-sm">
                <strong>Tuturuuu Mode:</strong> Fetch data directly from
                Tuturuuu. You need a valid API key for the source workspace.
              </p>
            </div>

            {/* API URL Field */}
            <div className="space-y-2">
              <Label htmlFor="tuturuuu-api-endpoint">Tuturuuu API URL</Label>
              {configLoading ? (
                <InputSkeleton />
              ) : (
                <Input
                  id="tuturuuu-api-endpoint"
                  placeholder="https://tuturuuu.com/api/v2"
                  value={tuturuuuApiEndpoint}
                  onChange={(e) =>
                    onTuturuuuApiEndpointChange(e.currentTarget.value)
                  }
                />
              )}
              <p className="text-muted-foreground text-xs">
                Default: https://tuturuuu.com/api/v2 (production). Change this
                for staging/dev instances.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="tuturuuu-api-key">
                  Tuturuuu API Key <span className="text-dynamic-red">*</span>
                </Label>
                {configLoading ? (
                  <InputSkeleton />
                ) : (
                  <div className="relative">
                    <Input
                      id="tuturuuu-api-key"
                      type={showTuturuuuApiKey ? 'text' : 'password'}
                      placeholder="Enter your Tuturuuu API key"
                      value={tuturuuuApiKey}
                      onChange={(e) =>
                        onTuturuuuApiKeyChange(e.currentTarget.value)
                      }
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-0 right-0 h-full px-3"
                      onClick={() => setShowTuturuuuApiKey(!showTuturuuuApiKey)}
                      tabIndex={-1}
                    >
                      {showTuturuuuApiKey ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                )}
                <p className="text-muted-foreground text-xs">
                  Generate an API key from your Tuturuuu workspace settings
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source-workspace-id">
                  Source Workspace ID{' '}
                  <span className="text-dynamic-red">*</span>
                </Label>
                <div className="space-y-1">
                  {configLoading ? (
                    <InputSkeleton />
                  ) : (
                    <Input
                      id="source-workspace-id"
                      placeholder="Workspace ID to pull data FROM"
                      value={sourceWorkspaceId}
                      onChange={(e) =>
                        onSourceWorkspaceIdChange(e.currentTarget.value)
                      }
                    />
                  )}
                  {!configLoading && sourceWorkspaceId && (
                    <WorkspaceNameDisplay
                      workspaceName={sourceWorkspaceName}
                      loading={loadingSourceWorkspaceName}
                      label="Source"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-workspace-id">
                  Target Workspace ID{' '}
                  <span className="text-dynamic-red">*</span>
                </Label>
                <div className="space-y-1">
                  {configLoading ? (
                    <InputSkeleton />
                  ) : (
                    <Input
                      id="target-workspace-id"
                      placeholder="Workspace ID to push data TO"
                      value={targetWorkspaceId}
                      onChange={(e) =>
                        onTargetWorkspaceIdChange(e.currentTarget.value)
                      }
                    />
                  )}
                  {!configLoading && targetWorkspaceId && (
                    <WorkspaceNameDisplay
                      workspaceName={targetWorkspaceName}
                      loading={loadingTargetWorkspaceName}
                      label="Target"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Legacy Mode Configuration
          <div className="space-y-4">
            <div className="rounded-lg border border-dynamic-yellow/30 bg-dynamic-yellow/5 p-4">
              <p className="text-sm">
                <strong>Legacy Mode:</strong> Configure a custom external API
                endpoint for data migration. Use this when migrating from
                non-Tuturuuu sources.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="legacy-api-endpoint">
                  API Endpoint <span className="text-dynamic-red">*</span>
                </Label>
                {configLoading ? (
                  <InputSkeleton />
                ) : (
                  <Input
                    id="legacy-api-endpoint"
                    placeholder="https://example.com/api/v1"
                    value={legacyApiEndpoint}
                    onChange={(e) =>
                      onLegacyApiEndpointChange(e.currentTarget.value)
                    }
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="legacy-api-key">
                  API Key <span className="text-dynamic-red">*</span>
                </Label>
                {configLoading ? (
                  <InputSkeleton />
                ) : (
                  <div className="relative">
                    <Input
                      id="legacy-api-key"
                      type={showLegacyApiKey ? 'text' : 'password'}
                      placeholder="Enter your API key"
                      value={legacyApiKey}
                      onChange={(e) =>
                        onLegacyApiKeyChange(e.currentTarget.value)
                      }
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-0 right-0 h-full px-3"
                      onClick={() => setShowLegacyApiKey(!showLegacyApiKey)}
                      tabIndex={-1}
                    >
                      {showLegacyApiKey ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-workspace-id-legacy">
                  Target Workspace ID{' '}
                  <span className="text-dynamic-red">*</span>
                </Label>
                <div className="space-y-1">
                  {configLoading ? (
                    <InputSkeleton />
                  ) : (
                    <Input
                      id="target-workspace-id-legacy"
                      placeholder="Workspace ID to push data TO"
                      value={targetWorkspaceId}
                      onChange={(e) =>
                        onTargetWorkspaceIdChange(e.currentTarget.value)
                      }
                    />
                  )}
                  {!configLoading && targetWorkspaceId && (
                    <WorkspaceNameDisplay
                      workspaceName={targetWorkspaceName}
                      loading={loadingTargetWorkspaceName}
                      label="Target"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkspaceNameDisplay({
  workspaceName,
  loading,
  label,
}: {
  workspaceName: string | null;
  loading: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {loading || workspaceName === null ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          Loading {label.toLowerCase()}...
        </span>
      ) : workspaceName !== '' ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 text-green-600" />
          {workspaceName}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-destructive">
          <AlertCircle className="h-3 w-3" />
          {label} not found
        </span>
      )}
    </div>
  );
}
