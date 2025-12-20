import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceApiKey } from '@tuturuuu/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { CodeBlock } from '@tuturuuu/ui/codeblock';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import EnvironmentSetup from './environment-setup';

export const metadata: Metadata = {
  title: 'API References',
  description:
    'Manage API References in the Dataset area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

async function getApiKeys(wsId: string): Promise<WorkspaceApiKey[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('workspace_api_keys')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  return data || [];
}

export default async function ApiReferencesPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, datasetId }) => {
        const headersList = await headers();
        const host = headersList.get('host');

        const rawApiKeys: WorkspaceApiKey[] = await getApiKeys(wsId);
        const apiKeys: { id: string; name: string; value: string }[] =
          rawApiKeys.map((key: WorkspaceApiKey) => ({
            id: key.id!,
            name: key.name!,
            value: key.key_prefix
              ? `${key.key_prefix}...`
              : 'your_api_key_here',
          }));

        const pythonSetupCode = `import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

DOMAIN = os.getenv("DOMAIN")
WORKSPACE_ID = os.getenv("WORKSPACE_ID")
DATASET_ID = os.getenv("DATASET_ID")
API_KEY = os.getenv("API_KEY")`;

        const pythonFetchCode = `import http.client
import json

conn = http.client.HTTPSConnection(DOMAIN)

headers = {
   "API_KEY": API_KEY,
   "Content-Type": "application/json"
}

conn.request(
   "GET",
   f"/api/v1/workspaces/{WORKSPACE_ID}/datasets/{DATASET_ID}/full",
   headers=headers
)

res = conn.getresponse()
data = res.read()`;

        const pythonParseCode = `import json
import pandas as pd

# Parse the JSON data
parsed_data = json.loads(data.decode("utf-8"))

# Extract rows from the data
rows = parsed_data["data"]

# Create list of dictionaries with flattened structure
flattened_data = []
for row in rows:
   # Get the cells dictionary
   cells = row["cells"]
   # Add row_id to the cells dictionary
   cells["row_id"] = row["row_id"]
   flattened_data.append(cells)`;

        const pythonDataframeCode = `# Convert to DataFrame
df = pd.DataFrame(flattened_data)

# Replace '…' with NaN
df = df.replace("…", pd.NA)

# Convert columns to numeric where possible
df = df.apply(pd.to_numeric, errors="ignore")

# Display first few rows
df.head()`;

        const jsFetchCode = `const DOMAIN = process.env.DOMAIN;
const WORKSPACE_ID = process.env.WORKSPACE_ID;
const DATASET_ID = process.env.DATASET_ID;
const API_KEY = process.env.API_KEY;

const response = await fetch(
 \`https://\${DOMAIN}/api/v1/workspaces/\${WORKSPACE_ID}/datasets/\${DATASET_ID}/full\`,
 {
   headers: {
     'API_KEY': API_KEY,
     'Content-Type': 'application/json',
   },
 }
);

const data = await response.json();`;

        const jsParseCode = `// Extract rows from the data
const rows = data.data;

// Create array of flattened objects
const flattenedData = rows.map(row => ({
 row_id: row.row_id,
 ...row.cells,
}));`;

        const jsProcessCode = `// Convert string numbers to actual numbers
const processValue = (value) => {
 if (value === '…') return null;
 const num = Number(value);
 return isNaN(num) ? value : num;
};

// Process all values in the flattened data
const processedData = flattenedData.map(row => 
 Object.fromEntries(
   Object.entries(row).map(([key, value]) => [
     key,
     processValue(value)
   ])
 )
);`;

        return (
          <div className="space-y-8">
            <div>
              <h1 className="font-bold text-3xl">API References</h1>
              <p className="mt-2 text-muted-foreground">
                Access and process your dataset programmatically using our REST
                API.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Authentication</CardTitle>
                <CardDescription>
                  Set up your environment variables and API key to authenticate
                  your requests.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EnvironmentSetup
                  wsId={wsId}
                  datasetId={datasetId}
                  host={host || ''}
                  apiKeys={apiKeys}
                />
              </CardContent>
            </Card>

            <div className="rounded-lg border bg-card">
              <Tabs defaultValue="python" className="w-full">
                <div className="border-b px-4">
                  <TabsList className="w-full justify-start gap-6 border-b-0 bg-transparent p-0">
                    <TabsTrigger
                      value="python"
                      className="relative h-11 rounded-none border-x-2 border-b-2 border-b-transparent bg-transparent px-4 pt-2 pb-3 font-semibold text-muted-foreground data-[state=active]:border-b-primary data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground"
                    >
                      Python
                    </TabsTrigger>
                    <TabsTrigger
                      value="javascript"
                      className="relative h-11 rounded-none border-x-2 border-b-2 border-b-transparent bg-transparent px-4 pt-2 pb-3 font-semibold text-muted-foreground data-[state=active]:border-b-primary data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground"
                    >
                      JavaScript
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-4">
                  <TabsContent value="python" className="m-0 space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Load Environment Variables</CardTitle>
                        <CardDescription>
                          Use python-dotenv to load the environment variables
                          from your .env file.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <CodeBlock language="python" value={pythonSetupCode} />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Fetch Data</CardTitle>
                        <CardDescription>
                          Make an HTTP request to our API endpoint to fetch your
                          dataset.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <CodeBlock language="python" value={pythonFetchCode} />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Parse Response</CardTitle>
                        <CardDescription>
                          Parse the JSON response and extract the data into a
                          flattened structure.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <CodeBlock language="python" value={pythonParseCode} />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Create DataFrame</CardTitle>
                        <CardDescription>
                          Convert the data into a pandas DataFrame for easy
                          analysis and manipulation.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <CodeBlock
                          language="python"
                          value={pythonDataframeCode}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="javascript" className="m-0 space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Fetch Data</CardTitle>
                        <CardDescription>
                          Use the Fetch API to make a request to our endpoint
                          with your API key.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <CodeBlock language="javascript" value={jsFetchCode} />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Parse Response</CardTitle>
                        <CardDescription>
                          Extract and flatten the data structure for easier
                          processing.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <CodeBlock language="javascript" value={jsParseCode} />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Process Data</CardTitle>
                        <CardDescription>
                          Convert string values to appropriate types and handle
                          missing values.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <CodeBlock
                          language="javascript"
                          value={jsProcessCode}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
