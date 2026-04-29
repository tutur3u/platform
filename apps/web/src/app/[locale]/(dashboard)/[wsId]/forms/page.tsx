import { Plus, Search } from '@tuturuuu/icons';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { normalizeMarkdownToText } from '@/features/forms/content';
import { FormsMarkdown } from '@/features/forms/forms-markdown';
import { listForms } from '@/features/forms/server';
import { FormCardActions } from './form-card-actions';
import { FormsImportButton } from './forms-import-button';

interface PageProps {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ q?: string; view?: string; status?: string }>;
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
        const { user } = await resolveAuthenticatedSessionUser(supabase);

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
        const viewMode = resolvedSearchParams.view === 'list' ? 'list' : 'grid';
        const statusFilter =
          resolvedSearchParams.status === 'all' ||
          resolvedSearchParams.status === 'draft' ||
          resolvedSearchParams.status === 'published' ||
          resolvedSearchParams.status === 'archived'
            ? resolvedSearchParams.status
            : 'active';
        const filteredForms = forms.filter((form) => {
          if (statusFilter === 'all') return true;
          if (statusFilter === 'active') return form.status !== 'closed';
          if (statusFilter === 'archived') return form.status === 'closed';
          return form.status === statusFilter;
        });
        const buildFormsHref = (
          overrides: Partial<Record<'view' | 'status', string>>
        ) => {
          const query = new URLSearchParams();
          if (resolvedSearchParams.q) {
            query.set('q', resolvedSearchParams.q);
          }
          const nextView = overrides.view ?? viewMode;
          const nextStatus = overrides.status ?? statusFilter;
          if (nextView !== 'grid') {
            query.set('view', nextView);
          }
          if (nextStatus !== 'active') {
            query.set('status', nextStatus);
          }
          const queryString = query.toString();
          return queryString
            ? `/${resolvedParams.wsId}/forms?${queryString}`
            : `/${resolvedParams.wsId}/forms`;
        };
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
              <div className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm md:p-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="space-y-3">
                    <p className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-3 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.35em]">
                      {t('brand')}
                    </p>
                    <div className="space-y-2">
                      <h1 className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text font-semibold text-4xl text-transparent tracking-tight md:text-5xl">
                        {t('pages.home_title')}
                      </h1>
                      <p className="max-w-3xl text-base text-muted-foreground md:text-lg">
                        {t('pages.home_description')}
                      </p>
                    </div>
                  </div>
                  {canManageForms ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <FormsImportButton workspaceSlug={resolvedParams.wsId} />
                      <Button asChild>
                        <Link href={`/${resolvedParams.wsId}/forms/new`}>
                          <Plus className="mr-2 h-4 w-4" />
                          {t('studio.create_form')}
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
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

              <Card className="border-border/60 bg-card/80">
                <CardContent className="flex flex-col gap-4 pt-6">
                  <form
                    action={`/${resolvedParams.wsId}/forms`}
                    method="get"
                    className="flex w-full max-w-sm items-center gap-2"
                  >
                    {viewMode !== 'grid' ? (
                      <input type="hidden" name="view" value={viewMode} />
                    ) : null}
                    {statusFilter !== 'active' ? (
                      <input type="hidden" name="status" value={statusFilter} />
                    ) : null}
                    <div className="relative flex-1">
                      <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="search"
                        name="q"
                        defaultValue={resolvedSearchParams.q}
                        placeholder={t('pages.search_placeholder')}
                        className="h-9 pl-9"
                      />
                    </div>
                    <Button type="submit" size="sm" variant="secondary">
                      {t('pages.search')}
                    </Button>
                  </form>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={
                          statusFilter === 'active' ? 'default' : 'outline'
                        }
                        asChild
                      >
                        <Link href={buildFormsHref({ status: 'active' })}>
                          {t('pages.filter_active')}
                        </Link>
                      </Button>
                      <Button
                        variant={statusFilter === 'all' ? 'default' : 'outline'}
                        asChild
                      >
                        <Link href={buildFormsHref({ status: 'all' })}>
                          {t('pages.filter_all')}
                        </Link>
                      </Button>
                      <Button
                        variant={
                          statusFilter === 'draft' ? 'default' : 'outline'
                        }
                        asChild
                      >
                        <Link href={buildFormsHref({ status: 'draft' })}>
                          {t('status.draft')}
                        </Link>
                      </Button>
                      <Button
                        variant={
                          statusFilter === 'published' ? 'default' : 'outline'
                        }
                        asChild
                      >
                        <Link href={buildFormsHref({ status: 'published' })}>
                          {t('status.published')}
                        </Link>
                      </Button>
                      <Button
                        variant={
                          statusFilter === 'archived' ? 'default' : 'outline'
                        }
                        asChild
                      >
                        <Link href={buildFormsHref({ status: 'archived' })}>
                          {t('pages.filter_archived')}
                        </Link>
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={viewMode === 'grid' ? 'default' : 'outline'}
                        asChild
                      >
                        <Link href={buildFormsHref({ view: 'grid' })}>
                          {t('pages.view_grid')}
                        </Link>
                      </Button>
                      <Button
                        variant={viewMode === 'list' ? 'default' : 'outline'}
                        asChild
                      >
                        <Link href={buildFormsHref({ view: 'list' })}>
                          {t('pages.view_list')}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {filteredForms.length === 0 ? (
                <Card className="border-border/60 bg-card/80">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    {t('pages.empty_filtered')}
                  </CardContent>
                </Card>
              ) : null}

              <div
                className={
                  viewMode === 'grid'
                    ? 'grid gap-5 lg:grid-cols-2 xl:grid-cols-3'
                    : 'space-y-4'
                }
              >
                {filteredForms.map((form) => (
                  <Card
                    key={form.id}
                    className="h-full border-border/60 bg-card/80 transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg"
                  >
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
                      <CardTitle className="line-clamp-2 text-2xl">
                        <FormsMarkdown
                          content={form.title}
                          variant="inline"
                          className="[&_p]:m-0"
                        />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="line-clamp-3 text-muted-foreground text-sm">
                        {form.description
                          ? normalizeMarkdownToText(form.description)
                          : t('pages.no_description')}
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
                          <p className="font-semibold">{form.responseCount}</p>
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
                      <p className="text-muted-foreground text-xs">
                        {new Date(form.updatedAt).toLocaleString()}
                      </p>
                      <FormCardActions
                        formId={form.id}
                        href={form.href}
                        workspaceSlug={resolvedParams.wsId}
                        isArchived={form.status === 'closed'}
                        canManageForms={!!canManageForms}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
