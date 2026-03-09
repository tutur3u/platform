import { Plus, Upload } from '@tuturuuu/icons';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { listForms } from '@/features/forms/server';

interface PageProps {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ q?: string }>;
}

export default async function FormsPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return (
    <WorkspaceWrapper params={Promise.resolve(resolvedParams)}>
      {async ({ wsId, workspace }) => {
        const t = await getTranslations('forms');
        const supabase = await createClient();
        const adminClient = await createAdminClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          notFound();
        }

        const [{ data: canManageForms }, { data: canViewAnalytics }] =
          await Promise.all([
            supabase.rpc('has_workspace_permission', {
              p_user_id: user.id,
              p_ws_id: wsId,
              p_permission: 'manage_forms',
            }),
            supabase.rpc('has_workspace_permission', {
              p_user_id: user.id,
              p_ws_id: wsId,
              p_permission: 'view_form_analytics',
            }),
          ]);

        if (!canManageForms && !canViewAnalytics) {
          notFound();
        }

        const forms = await listForms(
          adminClient,
          wsId,
          resolvedParams.wsId,
          resolvedSearchParams.q
        );
        const statusLabels = {
          closed: t('status.closed'),
          draft: t('status.draft'),
          published: t('status.published'),
        } as const;
        const accessLabels = {
          anonymous: t('access_mode.anonymous'),
          authenticated: t('access_mode.authenticated'),
          authenticated_email: t('access_mode.authenticated_email'),
        } as const;

        return (
          <div>
            <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-3">
                  <p className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-3 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.35em]">
                    {t('brand')}
                  </p>
                  <div className="space-y-2">
                    <h1 className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-5xl">
                      {t('pages.home_title')}
                    </h1>
                    <p className="max-w-3xl text-base text-muted-foreground md:text-lg">
                      {t('pages.home_description')}
                    </p>
                  </div>
                </div>
                {canManageForms ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" asChild>
                      <Link
                        href={`/${resolvedParams.wsId}/forms/new?tab=settings`}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {t('settings.import_form')}
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link href={`/${resolvedParams.wsId}/forms/new`}>
                        <Plus className="mr-2 h-4 w-4" />
                        {t('studio.create_form')}
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-border/60 bg-card/80">
                  <CardContent className="space-y-1 pt-6">
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
                      {t('pages.stats.forms')}
                    </p>
                    <p className="font-semibold text-3xl">{forms.length}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-card/80">
                  <CardContent className="space-y-1 pt-6">
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
                      {t('pages.stats.views')}
                    </p>
                    <p className="font-semibold text-3xl">
                      {forms.reduce((sum, item) => sum + item.viewCount, 0)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-card/80">
                  <CardContent className="space-y-1 pt-6">
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
                      {t('pages.stats.responses')}
                    </p>
                    <p className="font-semibold text-3xl">
                      {forms.reduce((sum, item) => sum + item.responseCount, 0)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-card/80">
                  <CardContent className="space-y-1 pt-6">
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
                      {t('pages.stats.workspace')}
                    </p>
                    <p className="font-semibold text-lg">{workspace.name}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                {forms.map((form) => (
                  <Link key={form.id} href={form.href}>
                    <Card className="h-full border-border/60 bg-card/80 transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg">
                      <CardHeader className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="rounded-full border border-border/60 px-3 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                            {
                              statusLabels[
                                form.status as keyof typeof statusLabels
                              ]
                            }
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {t('pages.completion_rate', {
                              rate: form.completionRate,
                            })}
                          </span>
                        </div>
                        <CardTitle className="text-2xl">{form.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="line-clamp-3 text-muted-foreground text-sm">
                          {form.description || t('pages.no_description')}
                        </p>
                        <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border/50 bg-muted/20 p-4 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                              {t('pages.stats.views')}
                            </p>
                            <p className="font-semibold">{form.viewCount}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                              {t('pages.stats.responses')}
                            </p>
                            <p className="font-semibold">
                              {form.responseCount}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                              {t('pages.access')}
                            </p>
                            <p className="font-semibold">
                              {
                                accessLabels[
                                  form.accessMode as keyof typeof accessLabels
                                ]
                              }
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
