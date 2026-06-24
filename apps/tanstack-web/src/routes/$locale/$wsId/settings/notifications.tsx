import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type AccountNotificationPreference,
  InternalApiError,
  listAccountNotificationPreferences,
  listWorkspaceNotificationPreferences,
  updateWorkspaceNotificationPreferences,
  type WorkspaceNotificationPreference,
  type WorkspaceNotificationPreferenceUpdate,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { WorkspaceNotificationSettings } from '@/components/notifications/workspace-notification-settings';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type NotificationSettingsData = {
  accountPreferences: AccountNotificationPreference[];
  workspaceId: string;
  workspacePreferences: WorkspaceNotificationPreference[];
};

type NotificationSettingsActionResult =
  | { ok: true }
  | { code?: string; message: string; ok: false; status?: number };

function toNotificationActionResult(
  error: InternalApiError
): NotificationSettingsActionResult {
  return {
    code: error.code,
    message: error.message,
    ok: false,
    status: error.status,
  };
}

function forwardedInternalApiAuth() {
  return withForwardedInternalApiAuth(getRequestHeaders());
}

const loadWorkspacePreferences = createServerFn({ method: 'GET' })
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data }) => {
    const response = await listWorkspaceNotificationPreferences(
      data.workspaceId,
      forwardedInternalApiAuth()
    );

    return response.preferences;
  });

const loadAccountPreferences = createServerFn({ method: 'GET' }).handler(
  async () => {
    const response = await listAccountNotificationPreferences(
      forwardedInternalApiAuth()
    );

    return response.preferences;
  }
);

const saveWorkspacePreferences = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      preferences: WorkspaceNotificationPreferenceUpdate[];
      workspaceId: string;
    }) => data
  )
  .handler(async ({ data }): Promise<NotificationSettingsActionResult> => {
    try {
      await updateWorkspaceNotificationPreferences(
        data.workspaceId,
        data.preferences,
        forwardedInternalApiAuth()
      );

      return { ok: true };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return toNotificationActionResult(error);
      }

      throw error;
    }
  });

function assertNotificationActionResult(
  result: NotificationSettingsActionResult
) {
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export const Route = createFileRoute('/$locale/$wsId/settings/notifications')({
  component: NotificationSettingsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Configure workspace notification preferences and browser notification access.',
      locale,
      title: 'Notification Settings',
    });
  },
  loader: async ({ params }): Promise<NotificationSettingsData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/settings/notifications`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const [accountPreferences, workspacePreferences] = await Promise.all([
      loadAccountPreferences(),
      loadWorkspacePreferences({
        data: {
          workspaceId: workspace.workspaceId,
        },
      }),
    ]);

    return {
      accountPreferences,
      workspaceId: workspace.workspaceId,
      workspacePreferences,
    };
  },
});

function NotificationSettingsRoutePage() {
  const data = Route.useLoaderData() as NotificationSettingsData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">
          Notification Settings
        </h1>
        <p className="text-foreground/60 text-sm">
          Configure how you receive notifications for different events in this
          workspace
        </p>
      </div>

      <WorkspaceNotificationSettings
        accountPreferences={data.accountPreferences}
        loadAccountPreferences={() => loadAccountPreferences()}
        loadWorkspacePreferences={() =>
          loadWorkspacePreferences({
            data: {
              workspaceId: data.workspaceId,
            },
          })
        }
        updateWorkspacePreferences={async (preferences) => {
          assertNotificationActionResult(
            await saveWorkspacePreferences({
              data: {
                preferences,
                workspaceId: data.workspaceId,
              },
            })
          );
        }}
        workspaceId={data.workspaceId}
        workspacePreferences={data.workspacePreferences}
      />
    </div>
  );
}
