import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Mail } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import {
  EmailTemplatePreview,
  type RenderEmailTemplateRequest,
  type RenderEmailTemplateResponse,
  renderEmailTemplatePreview,
} from '@/components/infrastructure/email-templates';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

const renderTemplatePreview = createServerFn({ method: 'POST' })
  .validator((data: RenderEmailTemplateRequest) => data)
  .handler(
    async ({ data }): Promise<RenderEmailTemplateResponse> =>
      renderEmailTemplatePreview(data)
  );

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/email-templates'
)({
  component: EmailTemplatesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Preview and test all available email templates in the Infrastructure area of your Tuturuuu workspace.',
      locale,
      title: 'Email Templates',
    });
  },
  loader: async ({ params }): Promise<void> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/email-templates`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const [canViewRootInfrastructure, canViewWorkspaceInfrastructure] =
      await Promise.all([
        hasWorkspacePermission({
          data: {
            permission: 'view_infrastructure',
            wsId: ROOT_WORKSPACE_ID,
          },
        }),
        hasWorkspacePermission({
          data: {
            permission: 'view_infrastructure',
            wsId: workspace.workspaceId,
          },
        }),
      ]);

    if (!canViewRootInfrastructure || !canViewWorkspaceInfrastructure) {
      throw notFound();
    }
  },
});

function EmailTemplatesRoutePage() {
  const t = useTranslations('email-templates');

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-2xl">{t('title')}</h1>
            <p className="text-foreground/80">{t('description')}</p>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      <EmailTemplatePreview
        renderTemplate={(input) => renderTemplatePreview({ data: input })}
      />
    </>
  );
}
