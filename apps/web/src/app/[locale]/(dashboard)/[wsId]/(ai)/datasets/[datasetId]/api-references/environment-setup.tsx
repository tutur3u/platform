'use client';

import ApiKeySelector from './api-key-selector';
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert';
import { CodeBlock } from '@repo/ui/components/ui/codeblock';
import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  wsId: string;
  datasetId: string;
  host: string;
  apiKeys: {
    id: string;
    name: string;
    value: string;
  }[];
}

export default function EnvironmentSetup({
  wsId,
  datasetId,
  host,
  apiKeys,
}: Props) {
  const [selectedApiKey, setSelectedApiKey] = useState<string>(
    apiKeys[0]?.value || 'your_api_key'
  );

  // Update selected API key if apiKeys changes and current selection is not valid
  useEffect(() => {
    if (
      apiKeys.length > 0 &&
      !apiKeys.some((key) => key.value === selectedApiKey)
    ) {
      setSelectedApiKey(apiKeys[0]?.value || 'your_api_key');
    }
  }, [apiKeys, selectedApiKey]);

  const envVars = `DOMAIN=${host}
WORKSPACE_ID=${wsId}
DATASET_ID=${datasetId}
API_KEY=${selectedApiKey}`;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">API Key</h3>
        <ApiKeySelector
          wsId={wsId}
          apiKeys={apiKeys}
          onSelect={setSelectedApiKey}
          defaultValue={selectedApiKey}
        />
      </div>

      <div className="space-y-4">
        <div className="flex flex-col items-start justify-between gap-2">
          <h3 className="text-sm font-medium">Environment Variables</h3>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Create a .env file in your project root
            </AlertDescription>
          </Alert>
        </div>
        <CodeBlock language="bash" value={envVars} />
      </div>
    </div>
  );
}
