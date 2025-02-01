import { logger } from '../utils/logging';
import { getSecureItem, setSecureItem } from '../utils/storage';
import { ValidationError, validateMigrationConfig } from '../utils/validation';
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert';
import { Card } from '@repo/ui/components/ui/card';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ConfigurationPanelProps {
  onConfigChange: (config: {
    apiEndpoint: string;
    apiKey: string;
    workspaceId: string;
    isValid: boolean;
  }) => void;
}

export function ConfigurationPanel({
  onConfigChange,
}: ConfigurationPanelProps) {
  const [apiEndpoint, setApiEndpoint] = useState(
    getSecureItem('api-endpoint') || ''
  );
  const [apiKey, setApiKey] = useState(getSecureItem('api-key') || '');
  const [workspaceId, setWorkspaceId] = useState(
    getSecureItem('workspace-id') || ''
  );
  const [errors, setErrors] = useState<ValidationError[]>([]);

  useEffect(() => {
    const validationErrors = validateMigrationConfig({
      apiEndpoint,
      apiKey,
      workspaceId,
    });

    setErrors(validationErrors);

    // Save values securely
    setSecureItem('api-endpoint', apiEndpoint);
    setSecureItem('api-key', apiKey);
    setSecureItem('workspace-id', workspaceId);

    // Notify parent component
    onConfigChange({
      apiEndpoint,
      apiKey,
      workspaceId,
      isValid: validationErrors.length === 0,
    });

    // Log configuration changes
    logger.log('info', 'config', 'Configuration updated', {
      hasApiEndpoint: !!apiEndpoint,
      hasApiKey: !!apiKey,
      hasWorkspaceId: !!workspaceId,
      isValid: validationErrors.length === 0,
    });
  }, [apiEndpoint, apiKey, workspaceId, onConfigChange]);

  const getError = (field: string) =>
    errors.find((error) => error.field === field)?.message;

  return (
    <Card className="p-6">
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h2 className="text-lg font-semibold">Migration Configuration</h2>
          <p className="text-muted-foreground text-sm">
            Configure the connection to your external API for data migration.
          </p>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="apiEndpoint">API Endpoint</Label>
            <Input
              id="apiEndpoint"
              placeholder="https://api.example.com"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              className={getError('apiEndpoint') ? 'border-red-500' : ''}
            />
            {getError('apiEndpoint') && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{getError('apiEndpoint')}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={getError('apiKey') ? 'border-red-500' : ''}
            />
            {getError('apiKey') && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{getError('apiKey')}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="workspaceId">Workspace ID</Label>
            <Input
              id="workspaceId"
              placeholder="Workspace ID"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className={getError('workspaceId') ? 'border-red-500' : ''}
            />
            {getError('workspaceId') && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{getError('workspaceId')}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
