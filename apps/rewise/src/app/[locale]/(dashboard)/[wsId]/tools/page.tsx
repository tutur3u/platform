import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getRewiseWorkspacePath } from '@/lib/workspace-routes';
import { recommendedTools, tools } from './data';

export default async function ToolsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId: workspaceSlug } = await params;
  const t = await getTranslations('ai_chat');

  return (
    <div className="grid gap-8 py-8">
      <section>
        <div className="mb-4 space-y-1">
          <h1 className="font-bold text-2xl tracking-tight lg:text-3xl">
            {t('tool_library')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('tool_library_description')}
          </p>
        </div>
        <h2 className="mb-4 font-semibold text-lg">{t('recommended_tools')}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recommendedTools.map((tool) => (
            <Link
              href={getRewiseWorkspacePath(workspaceSlug, `tools/${tool.id}`)}
              key={tool.name}
              className="group h-full"
            >
              <Card className="h-full group-hover:border-foreground">
                <CardHeader>
                  <CardTitle className="line-clamp-2">{tool.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2">{tool.description}</p>
                  <div className="flex flex-wrap items-center gap-1 font-semibold text-sm">
                    {tool.tags.map((tag) => (
                      <p
                        key={`${tool.name}-${tag}`}
                        className="mt-2 w-fit rounded-full border border-dynamic-purple/20 bg-dynamic-light-purple/10 px-2 py-0.5 text-dynamic-light-purple"
                      >
                        {tag}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-semibold text-lg">{t('all_tools')}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {tools.map((tool) => (
            <Link
              href={getRewiseWorkspacePath(workspaceSlug, `tools/${tool.id}`)}
              key={tool.name}
              className="group h-full"
            >
              <Card className="h-full group-hover:border-foreground">
                <CardHeader>
                  <CardTitle className="line-clamp-2">{tool.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2">{tool.description}</p>
                  <div className="flex flex-wrap items-center gap-1 font-semibold text-sm">
                    {tool.tags.map((tag) => (
                      <p
                        key={`${tool.name}-${tag}`}
                        className="mt-2 w-fit rounded-full border border-dynamic-purple/20 bg-dynamic-light-purple/10 px-2 py-0.5 text-dynamic-light-purple"
                      >
                        {tag}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
