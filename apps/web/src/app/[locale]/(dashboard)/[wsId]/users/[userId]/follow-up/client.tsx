'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import * as z from 'zod';
import { toast } from '@tuturuuu/ui/sonner';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Card, CardContent } from '@tuturuuu/ui/card';
import type { WorkspaceUserReport } from '@tuturuuu/types/db';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import UserMonthAttendance from '../../attendance/user-month-attendance';
import ScoreDisplay from '../../reports/[reportId]/score-display';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { availableConfigs } from '@/constants/configs/reports';
import { useEffect, useMemo, useState } from 'react';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';

const FollowUpSchema = z.object({
  source_name: z.string().min(1),
  source_email: z.string().email(),
  subject: z.string().min(1),
  content: z.string().min(1),
  to_email: z.string().email().optional(),
});

// Feature flag for experimental factor functionality
const ENABLE_FACTOR_CALCULATION = false;

type ReportWithNames = WorkspaceUserReport & {
  group_name: string;
  creator_name?: string | null;
  user_name?: string | null;
};

export default function FollowUpClient({
  wsId,
  userId,
  userName,
  userEmail,
  emailCredentials,
  userGroups = [],
}: {
  wsId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  emailCredentials?: { source_name: string; source_email: string };
  userGroups?: Array<{ id: string; name: string | null }>;
}) {
  const supabase = createClient();
  const locale = useLocale();
  const t = useTranslations();

  // Group selection state based on user's groups
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(
    userGroups?.[0]?.id
  );
  const selectedGroup = useMemo(
    () => userGroups.find((g) => g.id === selectedGroupId),
    [userGroups, selectedGroupId]
  );
  const groupId = selectedGroupId;

  // Fetch group managers (teachers) for the selected group
  const groupManagersQuery = useQuery({
    queryKey: ['ws', wsId, 'group', groupId, 'managers'],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<
      Array<{ id: string; full_name: string | null }>
    > => {
      const { data, error } = await supabase
        .from('workspace_user_groups_users')
        .select('user:workspace_users!inner(id, full_name, ws_id)')
        .eq('group_id', groupId!)
        .eq('role', 'TEACHER')
        .eq('user.ws_id', wsId);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ user: any }>;
      const managers: Array<{ id: string; full_name: string | null }> = [];
      for (const row of rows) {
        const u = row?.user;
        if (Array.isArray(u)) {
          const first = u[0];
          if (first)
            managers.push({ id: first.id, full_name: first.full_name ?? null });
        } else if (u) {
          managers.push({ id: u.id, full_name: u.full_name ?? null });
        }
      }
      return managers;
    },
  });

  // Local state: selected manager's display name
  const [selectedManagerName, setSelectedManagerName] = useState<
    string | undefined
  >(undefined);

  // Initialize/reset selected manager when group or list changes
  useEffect(() => {
    const names = (groupManagersQuery.data ?? [])
      .map((m) => m.full_name)
      .filter((n): n is string => Boolean(n));
    if (!names.length) {
      setSelectedManagerName(undefined);
      return;
    }
    if (selectedManagerName === undefined) setSelectedManagerName(names[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupManagersQuery.data, groupId]);
  const effectiveManagerName = selectedManagerName;

  const getConfig = (id: string) =>
    configsQuery.data?.find((c) => c.id === id)?.value;

  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';

    // Simple dynamic text parsing for common placeholders
    return text
      .replace(/{{user_name}}/g, userName || 'Unknown User')
      .replace(/{{group_name}}/g, selectedGroup?.name || 'Unknown Group')
      .replace(/{{date}}/g, new Date().toLocaleDateString())
      .replace(
        /{{score}}/g,
        (typeof mockReport?.score === 'number'
          ? mockReport?.score?.toFixed(1)
          : undefined) || 'N/A'
      )
      .replace(/{{group_manager_name}}/g, effectiveManagerName || '');
  };

  const form = useForm({
    resolver: zodResolver(FollowUpSchema),
    defaultValues: {
      source_name: '',
      source_email: '',
      subject: 'Follow-up Report',
      content: `Hello ${userName ?? ''},\n\nHere is your follow-up report...`,
      to_email: userEmail ?? '',
    },
  });

  // Hydrate form with email credentials when available from server
  useEffect(() => {
    if (emailCredentials) {
      if (emailCredentials.source_name)
        form.setValue('source_name', emailCredentials.source_name);
      if (emailCredentials.source_email)
        form.setValue('source_email', emailCredentials.source_email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailCredentials?.source_name, emailCredentials?.source_email]);

  // Query to fetch workspace configs for report customization
  const configsQuery = useQuery({
    queryKey: ['ws', wsId, 'report-configs'],
    queryFn: async (): Promise<WorkspaceConfig[]> => {
      const { data, error } = await supabase
        .from('workspace_configs')
        .select('*')
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const base = availableConfigs.map(({ defaultValue, ...rest }) => ({
        ...rest,
        value: defaultValue,
      }));
      const merged = [...base];
      (data ?? []).forEach((config) => {
        const idx = merged.findIndex((c) => c.id === config.id);
        if (idx !== -1) merged[idx] = { ...merged[idx], ...config };
        else merged.push(config);
      });
      return merged as WorkspaceConfig[];
    },
  });

  // Query to fetch healthcare vitals scores for the user
  const healthcareVitalsQuery = useQuery({
    queryKey: [
      'ws',
      wsId,
      'group',
      groupId,
      'user',
      userId,
      'healthcare-vitals',
    ],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<
      Array<{
        id: string;
        name: string;
        unit: string;
        factor: number;
        value: number | null;
      }>
    > => {
      const { data, error } = await supabase
        .from('user_indicators')
        .select(`
          value,
          healthcare_vitals!inner(
            id,
            name,
            unit,
            factor,
            group_id
          )
        `)
        .eq('user_id', userId)
        .eq('healthcare_vitals.group_id', groupId!);

      if (error) {
        throw error;
      }

      const result = (data ?? []).map((item) => ({
        id: item.healthcare_vitals.id,
        name: item.healthcare_vitals.name,
        unit: item.healthcare_vitals.unit,
        factor: item.healthcare_vitals.factor,
        value: item.value,
      }));
      return result;
    },
  });

  // Create a mock report for preview
  const mockReport: Partial<ReportWithNames> | undefined = useMemo(() => {
    if (!groupId) return undefined;

    // Calculate scores and average from healthcare vitals
    const vitals = healthcareVitalsQuery.data ?? [];

    const scores = vitals
      .filter((vital) => vital.value !== null && vital.value !== undefined)
      .map((vital) => {
        const baseValue = vital.value ?? 0;
        // Apply factor only if feature flag is enabled
        return ENABLE_FACTOR_CALCULATION
          ? baseValue * (vital.factor ?? 1)
          : baseValue;
      });

    const averageScore =
      scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : null;

    return {
      user_id: userId,
      group_id: groupId,
      group_name: selectedGroup?.name ?? 'Unknown Group',
      user_name: userName,
      created_at: new Date().toISOString(),
      scores: scores.length > 0 ? scores : [],
      score: averageScore,
      creator_name: effectiveManagerName,
      title: form.watch('subject'),
      content: form.watch('content'),
      feedback: '',
    } as Partial<ReportWithNames>;
  }, [
    groupId,
    userId,
    selectedGroup?.name,
    userName,
    healthcareVitalsQuery.data,
    form.watch('subject'),
    form.watch('content'),
    effectiveManagerName,
  ]);

  const groupOptions: ComboboxOptions[] = useMemo(
    () =>
      (userGroups ?? []).map((g) => ({
        value: g.id,
        label: g.name || 'No name',
      })),
    [userGroups]
  );

  const managerOptions: ComboboxOptions[] = useMemo(
    () =>
      (groupManagersQuery.data ?? [])
        .map((m) => ({
          value: m.full_name || '',
          label: m.full_name || 'No name',
        }))
        .filter((o) => Boolean(o.value)),
    [groupManagersQuery.data]
  );

  const extractReportHtml = (): string => {
    const printableArea = document.getElementById('printable-area');
    if (!printableArea) {
      throw new Error('Report preview not found');
    }

    // Serialize accessible stylesheets into a single <style> block (avoid external links)
    const inlineStyles = (() => {
      const collected: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          // Attempt to read cssRules; will throw on cross-origin sheets
          const rules = (sheet as CSSStyleSheet).cssRules;
          if (!rules) continue;
          const cssText = Array.from(rules)
            .map(
              (r) => (r as CSSStyleRule | CSSImportRule | CSSMediaRule).cssText
            )
            .join('\n');
          if (cssText) collected.push(cssText);
        } catch (_) {
          // Skip cross-origin stylesheets we cannot access due to CORS
          continue;
        }
      }
      return `<style>\n${collected.join('\n')}\n</style>`;
    })();

    // Create the HTML content for email
    const emailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${parseDynamicText(form.watch('subject')) || 'Follow-up Report'}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          ${inlineStyles}
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: system-ui, -apple-system, sans-serif;
              background: white;
              color: black;
            }
            #printable-area {
              height: auto !important;
              width: auto !important;
              max-width: none !important;
              border: none !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              margin: 0 !important;
              background: white !important;
              color: black !important;
            }
          </style>
        </head>
        <body>
          ${printableArea.outerHTML}
        </body>
      </html>
    `;

    return emailContent;
  };

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof FollowUpSchema>) => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error('User not authenticated');

      // Extract the report HTML
      const reportHtml = extractReportHtml();

      // Map to RPC payload
      const payload = {
        p_ws_id: wsId,
        p_sender_id: authUser.id,
        p_receiver_id: userId,
        p_source_name: values.source_name,
        p_source_email: values.source_email,
        p_subject: values.subject,
        p_content: reportHtml, // Send the HTML report as content
        p_email: values.to_email || userEmail || '',
        p_post_id: undefined,
      };

      const { data, error } = await supabase.rpc(
        'create_guest_lead_email',
        payload
      );
      if (error) throw error;
      return data as { status: string; mail_id?: string };
    },
    onSuccess: () => {
      toast.success('Follow-up sent');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'An unexpected error occurred');
    },
  });

  return (
    <div className="flex w-full h-screen overflow-hidden">
      <div className="grid grid-cols-2 gap-6 w-full h-full">
        {/* Left Column - Form and Attendance */}
        <div className="flex flex-col space-y-4 overflow-y-auto p-6">
          <div>
            <h2 className="text-lg font-semibold">Compose Follow-up Email</h2>
            <p className="text-sm text-muted-foreground">
              Fill out the email details and see the live preview on the right.
            </p>
          </div>

          {/* Group and Manager Selection */}
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Group</label>
                <Combobox
                  key="group-combobox"
                  t={t}
                  options={groupOptions}
                  selected={groupId ?? ''}
                  placeholder="Select group"
                  onChange={(val) => {
                    const next =
                      typeof val === 'string'
                        ? val
                        : Array.isArray(val)
                          ? val[0]
                          : '';
                    setSelectedGroupId(next || undefined);
                    // reset manager when changing group
                    setSelectedManagerName(undefined);
                  }}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Group manager</label>
                <Combobox
                  key="manager-combobox"
                  t={t}
                  options={managerOptions}
                  selected={selectedManagerName ?? ''}
                  placeholder="Select manager"
                  disabled={
                    groupManagersQuery.isLoading || managerOptions.length === 0
                  }
                  onChange={(val) => {
                    const next =
                      typeof val === 'string'
                        ? val
                        : Array.isArray(val)
                          ? val[0]
                          : '';
                    setSelectedManagerName(next || undefined);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="to_email">
                  To
                </label>
                <Input
                  id="to_email"
                  value={form.watch('to_email')}
                  onChange={(e) => form.setValue('to_email', e.target.value)}
                  placeholder={userEmail || 'user@example.com'}
                  disabled
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="source_name">
                  Sender name
                </label>
                <Input
                  id="source_name"
                  value={form.watch('source_name')}
                  onChange={(e) => form.setValue('source_name', e.target.value)}
                  placeholder={emailCredentials?.source_name || 'Your name'}
                  disabled
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="source_email">
                  Sender email
                </label>
                <Input
                  id="source_email"
                  type="email"
                  value={form.watch('source_email')}
                  onChange={(e) =>
                    form.setValue('source_email', e.target.value)
                  }
                  placeholder={
                    emailCredentials?.source_email || 'you@example.com'
                  }
                  disabled
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="subject">
                  Subject
                </label>
                <Input
                  id="subject"
                  value={form.watch('subject')}
                  onChange={(e) => form.setValue('subject', e.target.value)}
                  placeholder="Report title..."
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="content">
                  Report Content
                </label>
                <Textarea
                  id="content"
                  className="min-h-32 resize-none"
                  value={form.watch('content')}
                  onChange={(e) => form.setValue('content', e.target.value)}
                  placeholder="Enter the main content for the report...\n\nYou can use placeholders like {{user_name}}, {{group_name}}, {{date}}, {{score}}"
                />
                <p className="text-xs text-muted-foreground">
                  This content will be included in the report. The full report
                  preview will be sent as the email body.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(form.getValues() as any)}
                  className="w-full sm:w-auto"
                >
                  {mutation.isPending ? 'Sending...' : 'Send Email'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Attendance Section */}
          {userName && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attendance Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <UserMonthAttendance
                  wsId={wsId}
                  user={{
                    id: userId,
                    full_name: userName,
                    href: `/${wsId}/users/${userId}`,
                  }}
                  defaultIncludedGroups={groupId ? [groupId] : undefined}
                  noOutline
                />
              </CardContent>
            </Card>
          )}

          {/* Performance Metrics Section */}
          {healthcareVitalsQuery.data &&
            healthcareVitalsQuery.data.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScoreDisplay
                    healthcareVitals={healthcareVitalsQuery.data}
                    healthcareVitalsLoading={healthcareVitalsQuery.isLoading}
                    factorEnabled={ENABLE_FACTOR_CALCULATION}
                    scores={mockReport?.scores}
                    isNew={true}
                  />
                </CardContent>
              </Card>
            )}
        </div>

        {/* Right Column - Full Height Report Preview */}
        <div className="flex flex-col h-full overflow-hidden">
          <div className="p-6 pb-4">
            <h2 className="text-lg font-semibold">Live Preview</h2>
            <p className="text-sm text-muted-foreground">
              Preview updates as you type in the form.
            </p>
          </div>

          <div className="flex-1 px-6 pb-6 overflow-y-auto">
            {mockReport && configsQuery.data ? (
              <ReportPreview
                t={(key: string) => key} // Simple fallback for translations
                lang={locale}
                parseDynamicText={parseDynamicText}
                getConfig={getConfig}
                theme="light"
                data={{
                  title: parseDynamicText(form.watch('subject')) as string,
                  content: parseDynamicText(form.watch('content')) as string,
                  score:
                    typeof mockReport.score === 'number'
                      ? mockReport.score.toFixed(1)
                      : mockReport.score
                        ? String(mockReport.score)
                        : '',
                  feedback: '',
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-muted-foreground">
                    No report data available for preview
                  </p>
                  {!groupId && (
                    <p className="text-sm text-muted-foreground mt-2">
                      User needs to be assigned to a group to show report data.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
