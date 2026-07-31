'use client';

import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Braces,
  CheckCircle2,
  Coins,
  KeyRound,
  Lock,
  Server,
  Terminal,
  Workflow,
} from '@tuturuuu/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CodeSnippet } from './code-snippet';
import {
  ActionCard,
  ExampleCard,
  ProductionChecklist,
  SectionHeading,
  StepCard,
} from './docs-components';
import {
  AI_STUDIO_BASE_URL,
  chatCompletionsCurl,
  environmentExample,
  listModelsCurl,
  responsesCurl,
  responsesTypeScript,
  streamingTypeScript,
  toolLoopCurl,
} from './snippets';

const endpoints = [
  ['GET', '/v1/models', 'models'],
  ['POST', '/v1/responses', 'responses'],
  ['POST', '/v1/chat/completions', 'chat'],
  ['POST', '/v1/embeddings', 'embeddings'],
  ['POST', '/v1/images/generations', 'images'],
  ['POST', '/v1/audio/speech', 'speech'],
  ['POST', '/v1/agents/{agentId}/responses', 'agents'],
] as const;

export function DeveloperDocsPanel({
  canManageAiKeys,
  workspaceId,
}: {
  canManageAiKeys: boolean;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.developer_docs');
  const snippetLabels = {
    copiedLabel: t('copied'),
    copyLabel: t('copy'),
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]">
      <nav
        className="xl:sticky xl:top-4 xl:h-fit"
        aria-label={t('on_this_page')}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t('on_this_page')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            {[
              ['quickstart', t('quickstart')],
              ['endpoints', t('endpoints')],
              ['tools-streaming', t('tools_streaming')],
              ['production', t('production_readiness')],
              ['errors', t('errors')],
            ].map(([href, label]) => (
              <a
                className="rounded-lg px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                href={`#${href}`}
                key={href}
              >
                {label}
              </a>
            ))}
          </CardContent>
        </Card>
      </nav>

      <div className="min-w-0 space-y-5">
        <section id="quickstart" className="scroll-mt-4 space-y-4">
          <SectionHeading
            description={t('quickstart_description')}
            icon={Terminal}
            title={t('quickstart')}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <StepCard
              description={t('step_key_description')}
              index="1"
              title={t('step_key')}
            />
            <StepCard
              description={t('step_models_description')}
              index="2"
              title={t('step_models')}
            />
            <StepCard
              description={t('step_request_description')}
              index="3"
              title={t('step_request')}
            />
          </div>
          <Card className="overflow-hidden border-primary/20">
            <CardHeader className="gap-3 border-b bg-primary/[0.04]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{t('credential_title')}</CardTitle>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {t('credential_description')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManageAiKeys ? (
                    <Button asChild size="sm">
                      <Link href={`/${workspaceId}/api-keys`}>
                        <KeyRound className="mr-2 size-4" />
                        {t('manage_keys')}
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/${workspaceId}/playground`}>
                      <Terminal className="mr-2 size-4" />
                      {t('test_playground')}
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <CodeSnippet
                {...snippetLabels}
                language=".env"
                value={environmentExample}
              />
              <p className="flex items-start gap-2 text-muted-foreground text-sm">
                <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
                {t('server_only')}
              </p>
            </CardContent>
          </Card>
          <div className="grid gap-4 2xl:grid-cols-2">
            <ExampleCard title={t('list_models')}>
              <CodeSnippet
                {...snippetLabels}
                language="curl"
                value={listModelsCurl}
              />
            </ExampleCard>
            <ExampleCard title={t('first_response')}>
              <CodeSnippet
                {...snippetLabels}
                language="curl"
                value={responsesCurl}
              />
            </ExampleCard>
          </div>
          <ExampleCard title={t('server_typescript')}>
            <CodeSnippet
              {...snippetLabels}
              language="typescript"
              value={responsesTypeScript}
            />
          </ExampleCard>
        </section>

        <section id="endpoints" className="scroll-mt-4 space-y-4">
          <SectionHeading
            description={t('endpoints_description')}
            icon={Server}
            title={t('endpoints')}
          />
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {t('production_base_url')}
                </CardTitle>
                <Badge className="font-mono" variant="outline">
                  {AI_STUDIO_BASE_URL}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {endpoints.map(([method, path, key]) => (
                  <div
                    className="grid gap-2 p-4 sm:grid-cols-[4rem_minmax(13rem,0.8fr)_minmax(0,1.2fr)] sm:items-center"
                    key={path}
                  >
                    <Badge className="w-fit" variant="secondary">
                      {method}
                    </Badge>
                    <code className="break-all font-mono text-xs">{path}</code>
                    <span className="text-muted-foreground text-sm">
                      {t(`endpoint_${key}`)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <ExampleCard title={t('chat_example')}>
            <CodeSnippet
              {...snippetLabels}
              language="curl"
              value={chatCompletionsCurl}
            />
          </ExampleCard>
        </section>

        <section id="tools-streaming" className="scroll-mt-4 space-y-4">
          <SectionHeading
            description={t('tools_streaming_description')}
            icon={Workflow}
            title={t('tools_streaming')}
          />
          <Accordion
            className="rounded-xl border px-4"
            defaultValue={['tool-loop']}
            type="multiple"
          >
            <AccordionItem value="tool-loop">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Braces className="size-4 text-primary" />
                  {t('tool_loop_title')}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-muted-foreground">
                  {t('tool_loop_description')}
                </p>
                <CodeSnippet
                  {...snippetLabels}
                  language="curl"
                  value={toolLoopCurl}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="streaming">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Activity className="size-4 text-primary" />
                  {t('streaming_title')}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-muted-foreground">
                  {t('streaming_description')}
                </p>
                <CodeSnippet
                  {...snippetLabels}
                  language="typescript"
                  value={streamingTypeScript}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        <section id="production" className="scroll-mt-4 space-y-4">
          <SectionHeading
            description={t('production_description')}
            icon={CheckCircle2}
            title={t('production_readiness')}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <ActionCard
              description={t('security_description')}
              href={canManageAiKeys ? `/${workspaceId}/api-keys` : undefined}
              icon={Lock}
              title={t('security')}
            />
            <ActionCard
              description={t('credits_description')}
              href={`/${workspaceId}/credits`}
              icon={Coins}
              title={t('credits')}
            />
            <ActionCard
              description={t('observability_description')}
              href={`/${workspaceId}/runs`}
              icon={Activity}
              title={t('observability')}
            />
          </div>
          <ProductionChecklist
            items={[
              t('check_secret_manager'),
              t('check_request_id'),
              t('check_timeout_retry'),
              t('check_budget'),
              t('check_logs'),
              t('check_revoke'),
            ]}
          />
        </section>

        <section id="errors" className="scroll-mt-4 space-y-4">
          <SectionHeading
            description={t('errors_description')}
            icon={BookOpen}
            title={t('errors')}
          />
          <Card>
            <CardContent className="space-y-3 pt-6">
              {[
                ['400', 'invalid_request_error'],
                ['401', 'invalid_api_key'],
                ['402', 'insufficient_credits'],
                ['404', 'model_not_found'],
                ['429', 'rate_limit_exceeded'],
                ['500', 'server_error'],
              ].map(([status, code]) => (
                <div
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[3rem_12rem_1fr]"
                  key={code}
                >
                  <Badge className="w-fit" variant="outline">
                    {status}
                  </Badge>
                  <code className="font-mono text-xs">{code}</code>
                  <span className="text-muted-foreground text-sm">
                    {t(`error_${code}`)}
                  </span>
                </div>
              ))}
              <p className="text-muted-foreground text-sm">
                {t('error_request_id')}
              </p>
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
            <div>
              <div className="font-medium">{t('full_reference')}</div>
              <p className="text-muted-foreground text-sm">
                {t('full_reference_description')}
              </p>
            </div>
            <Button asChild variant="outline">
              <a
                href="https://docs.tuturuuu.com/reference/api-reference/ai-studio"
                rel="noreferrer"
                target="_blank"
              >
                {t('open_reference')}
                <ArrowUpRight className="ml-2 size-4" />
              </a>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
