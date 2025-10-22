'use client';

import { Code2, FileText, FolderOpen } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { CodeBlock } from '@tuturuuu/ui/codeblock';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';

export default function SDKGuide() {
  const t = useTranslations('ws-api-keys');

  const installCode = {
    npm: 'npm install tuturuuu',
    yarn: 'yarn add tuturuuu',
    pnpm: 'pnpm add tuturuuu',
    bun: 'bun add tuturuuu',
  };

  const initCode = `import { TuturuuuClient } from 'tuturuuu';

const client = new TuturuuuClient('ttr_your_api_key_here');`;

  const storageListCode = `// List files in your workspace
const files = await client.storage.list({
  path: 'documents',
  limit: 50,
  sortBy: 'created_at',
  sortOrder: 'desc'
});

console.log(\`Found \${files.data.length} files\`);`;

  const storageUploadCode = `// Upload a file
const file = new File(['content'], 'report.pdf');
const result = await client.storage.upload(file, {
  path: 'documents/reports',
  upsert: true // overwrite if exists
});

console.log('Uploaded:', result.data.path);`;

  const storageShareCode = `// Generate a signed URL (temporary link)
const { data } = await client.storage.share('documents/report.pdf', {
  expiresIn: 3600 // 1 hour in seconds
});

console.log('Share link:', data.signedUrl);`;

  const documentCreateCode = `// Create a document
const doc = await client.documents.create({
  name: 'Meeting Notes',
  content: 'Discussion points...',
  isPublic: false
});

console.log('Created document:', doc.data.id);`;

  const documentSearchCode = `// Search documents
const results = await client.documents.search('meeting');

console.log(\`Found \${results.data.length} documents\`);`;

  const errorHandlingCode = `import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError
} from 'tuturuuu';

try {
  await client.storage.upload(file);
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Invalid API key
    console.error('Invalid API key');
  } else if (error instanceof AuthorizationError) {
    // Insufficient permissions
    console.error('Insufficient permissions');
  } else if (error instanceof NotFoundError) {
    // Resource not found
    console.error('File not found');
  } else if (error instanceof RateLimitError) {
    // Rate limit exceeded
    console.error('Rate limit exceeded');
  }
}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-dynamic-blue/10 p-2">
              <Code2 className="h-5 w-5 text-dynamic-blue" />
            </div>
            <div>
              <CardTitle>{t('sdk_guide_title')}</CardTitle>
              <CardDescription>{t('sdk_guide_description')}</CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="bg-dynamic-blue/10 text-dynamic-blue"
          >
            {t('sdk_guide_badge')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Introduction */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">
              {t('sdk_getting_started')}
            </h3>
            <div className="space-y-3 text-muted-foreground text-sm leading-relaxed">
              <p>
                The{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  tuturuuu
                </code>{' '}
                SDK provides a type-safe, promise-based API for interacting with
                your workspace. It handles authentication, error handling, and
                API communication automatically.
              </p>
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {t('sdk_key_features')}:
                </p>
                <ul className="ml-5 list-disc space-y-1">
                  <li>
                    <strong>Type-safe</strong>: Full TypeScript support with
                    comprehensive type definitions
                  </li>
                  <li>
                    <strong>Promise-based</strong>: Modern async/await API for
                    all operations
                  </li>
                  <li>
                    <strong>Error handling</strong>: Specific error classes for
                    different failure scenarios
                  </li>
                  <li>
                    <strong>Zero config</strong>: Works out of the box with just
                    your API key
                  </li>
                </ul>
              </div>
              <p className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-3 text-dynamic-blue text-xs">
                <strong>📚 Full Documentation:</strong> For comprehensive API
                reference, type definitions, and advanced usage patterns, visit{' '}
                <a
                  href="https://docs.tuturuuu.com/reference/packages/sdk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-dynamic-blue/80"
                >
                  docs.tuturuuu.com/reference/packages/sdk
                </a>
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Installation */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">{t('sdk_installation')}</h3>
          <p className="text-muted-foreground text-sm">
            Install the SDK using your preferred package manager:
          </p>
          <Tabs defaultValue="bun" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="bun">Bun</TabsTrigger>
              <TabsTrigger value="npm">NPM</TabsTrigger>
              <TabsTrigger value="yarn">Yarn</TabsTrigger>
              <TabsTrigger value="pnpm">PNPM</TabsTrigger>
            </TabsList>
            {Object.entries(installCode).map(([manager, code]) => (
              <TabsContent key={manager} value={manager}>
                <CodeBlock language="bash" value={code} />
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <Separator />

        {/* Initialization */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">{t('sdk_initialization')}</h3>
          <div className="space-y-2 text-muted-foreground text-sm">
            <p>{t('sdk_initialization_description')}</p>
            <div className="space-y-2 rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-3 text-xs">
              <strong className="text-dynamic-orange">
                ⚠️ Security Best Practice:
              </strong>
              <p className="text-foreground/80">
                Never hardcode API keys in your source code. Use environment
                variables or secret management services:
              </p>
              <CodeBlock
                language="typescript"
                value="const client = new TuturuuuClient(process.env.TUTURUUU_API_KEY);"
              />
            </div>
          </div>
          <CodeBlock language="typescript" value={initCode} />
        </div>

        <Separator />

        {/* Examples */}
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-lg">{t('sdk_examples')}</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              Explore common use cases and code patterns. Click each section to
              expand and see detailed examples.
            </p>
          </div>

          {/* Storage Examples */}
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <FolderOpen className="h-5 w-5 text-dynamic-purple" />
                <div className="text-left">
                  <p className="font-medium">{t('sdk_storage_operations')}</p>
                  <p className="text-muted-foreground text-sm">
                    {t('sdk_storage_operations_description')}
                  </p>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 p-4">
              <div className="space-y-2">
                <p className="font-medium text-sm">{t('sdk_list_files')}</p>
                <CodeBlock language="typescript" value={storageListCode} />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-sm">{t('sdk_upload_file')}</p>
                <CodeBlock language="typescript" value={storageUploadCode} />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-sm">{t('sdk_share_file')}</p>
                <CodeBlock language="typescript" value={storageShareCode} />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Document Examples */}
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-dynamic-green" />
                <div className="text-left">
                  <p className="font-medium">{t('sdk_document_operations')}</p>
                  <p className="text-muted-foreground text-sm">
                    {t('sdk_document_operations_description')}
                  </p>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 p-4">
              <div className="space-y-2">
                <p className="font-medium text-sm">
                  {t('sdk_create_document')}
                </p>
                <CodeBlock language="typescript" value={documentCreateCode} />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-sm">
                  {t('sdk_search_documents')}
                </p>
                <CodeBlock language="typescript" value={documentSearchCode} />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Error Handling */}
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <Code2 className="h-5 w-5 text-dynamic-orange" />
                <div className="text-left">
                  <p className="font-medium">{t('sdk_error_handling')}</p>
                  <p className="text-muted-foreground text-sm">
                    {t('sdk_error_handling_description')}
                  </p>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 p-4">
              <CodeBlock language="typescript" value={errorHandlingCode} />
            </CollapsibleContent>
          </Collapsible>
        </div>

        <Separator />

        {/* Permissions Note */}
        <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/10 p-4">
          <h4 className="mb-2 font-semibold text-sm">
            {t('sdk_permissions_title')}
          </h4>
          <p className="text-sm leading-relaxed">
            {t('sdk_permissions_description')}
          </p>
          <ul className="mt-2 ml-4 list-disc space-y-1 text-sm">
            <li>
              <strong>{t('sdk_storage_operations')}:</strong>{' '}
              {t('sdk_requires_manage_drive')}
            </li>
            <li>
              <strong>{t('sdk_document_operations')}:</strong>{' '}
              {t('sdk_requires_manage_documents')}
            </li>
          </ul>
        </div>

        {/* Documentation Link */}
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div>
            <p className="font-medium">{t('sdk_full_documentation')}</p>
            <p className="text-muted-foreground text-sm">
              {t('sdk_full_documentation_description')}
            </p>
          </div>
          <Button asChild variant="outline">
            <a
              href="https://docs.tuturuuu.com/reference/packages/sdk"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('sdk_view_docs')}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
