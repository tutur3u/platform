'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import LeadGenerationPreview from '@tuturuuu/ui/custom/lead-generation-preview';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import * as z from 'zod';
import { API_URL } from '@/constants/common';
import { availableConfigs } from '@/constants/configs/reports';
import UserMonthAttendance from '../../attendance/user-month-attendance';
import ScoreDisplay from '../../reports/[reportId]/score-display';

const FollowUpSchema = z.object({
  source_name: z.string().min(1),
  source_email: z.email(),
  subject: z.string().min(1),
  content: z.string().min(1),
  to_email: z.email().optional(),
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
  userArchived,
  userArchivedUntil,
  userNote,
  emailCredentials,
  userGroups = [],
  minimumAttendance,
  canCheckUserAttendance,
}: {
  wsId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userArchived?: boolean;
  userArchivedUntil?: string | null;
  userNote?: string | null;
  emailCredentials?: { source_name: string; source_email: string };
  userGroups?: Array<{ id: string; name: string | null }>;
  minimumAttendance?: number;
  canCheckUserAttendance?: boolean;
}) {
  const supabase = createClient();
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
  }, [groupManagersQuery.data, selectedManagerName]);

  const effectiveManagerName = selectedManagerName;

  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';

    // Simple dynamic text parsing for common placeholders
    return text
      .replace(/{{user_name}}/g, userName || t('users.follow_up.unknown_user'))
      .replace(
        /{{group_name}}/g,
        selectedGroup?.name || t('users.follow_up.unknown_group')
      )
      .replace(/{{date}}/g, new Date().toLocaleDateString())
      .replace(
        /{{score}}/g,
        (typeof mockReport?.score === 'number'
          ? mockReport?.score?.toFixed(1)
          : undefined) || t('users.follow_up.na')
      )
      .replace(/{{group_manager_name}}/g, effectiveManagerName || '')
      .replace(/{{minimum_attendance}}/g, minimumAttendance?.toString() || '');
  };

  // Compute default subject with localized format
  const defaultSubject = useMemo(() => {
    if (!emailCredentials?.source_name) return '';

    const today = new Date();
    const formattedDate = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    return t('users.follow_up.trial_period_report_subject', {
      sourceName: emailCredentials.source_name,
      date: formattedDate,
      userName: userName || 'Unknown User',
    });
  }, [emailCredentials?.source_name, userName, t]);

  const form = useForm({
    resolver: zodResolver(FollowUpSchema),
    defaultValues: {
      source_name: emailCredentials?.source_name || '',
      source_email: emailCredentials?.source_email || '',
      subject: defaultSubject,
      content: t('users.follow_up.default_content', {
        userName: userName ?? '',
      }),
      to_email: userEmail ?? '',
    },
  });

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
    effectiveManagerName,
    form.watch,
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

  const finalScore = useMemo(() => {
    return typeof mockReport?.score === 'number'
      ? Math.round(mockReport.score * 100) / 100
      : undefined;
  }, [mockReport?.score]);

  const extractReportHtml = async (): Promise<string> => {
    if (!mockReport || !configsQuery.data) {
      throw new Error('Report data not available');
    }
    const { render } = await import('@react-email/render');
    const React = await import('react');
    const LeadGenerationEmailTemplate = (
      await import(
        '@/app/[locale]/(dashboard)/[wsId]/mail/lead-generation-email-template'
      )
    ).default;

    // Get config helper
    const getConfig = (id: string) =>
      configsQuery.data?.find((c) => c.id === id)?.value;

    // Helper to parse config values that may contain dynamic placeholders
    const parseConfigText = (
      configValue: string | undefined | null
    ): string => {
      if (!configValue) return '';
      return parseDynamicText(configValue) as string;
    };

    // Create the lead generation email template
    const emailElement = React.createElement(LeadGenerationEmailTemplate, {
      leadName: userName,
      className: selectedGroup?.name ?? undefined,
      teacherName: effectiveManagerName,
      avgScore: finalScore,
      comments: parseDynamicText(form.watch('content')) as string,
      currentDate: new Date().toLocaleDateString(),
      minimumAttendance: minimumAttendance,

      // Required configs - parse dynamic text
      brandLogoUrl: getConfig('BRAND_LOGO_URL') || '',
      brandName: parseConfigText(getConfig('BRAND_NAME')),
      brandPhone: parseConfigText(getConfig('BRAND_PHONE_NUMBER')),
      emailTitle: parseConfigText(getConfig('LEAD_EMAIL_TITLE')),
      emailGreeting: parseConfigText(getConfig('LEAD_EMAIL_GREETING')),
      tableHeaderComments: parseConfigText(
        getConfig('LEAD_EMAIL_TABLE_HEADER_COMMENTS')
      ),
      tableHeaderScore: parseConfigText(
        getConfig('LEAD_EMAIL_TABLE_HEADER_SCORE')
      ),
      emailFooter: parseConfigText(getConfig('LEAD_EMAIL_FOOTER')),
      signatureTitle: parseConfigText(getConfig('LEAD_EMAIL_SIGNATURE_TITLE')),
      signatureName: parseConfigText(getConfig('LEAD_EMAIL_SIGNATURE_NAME')),

      // Optional configs - parse dynamic text
      brandLocation: parseConfigText(getConfig('BRAND_LOCATION')) || undefined,
      tableScoreScale:
        parseConfigText(getConfig('LEAD_EMAIL_TABLE_SCORE_SCALE')) || undefined,
      emptyCommentsPlaceholder:
        parseConfigText(getConfig('LEAD_EMAIL_EMPTY_COMMENTS')) || undefined,
      emptyScorePlaceholder:
        parseConfigText(getConfig('LEAD_EMAIL_EMPTY_SCORE')) || undefined,
    });

    // Render the email template to HTML string
    const reportHTML = await render(emailElement);

    return reportHTML;
  };

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof FollowUpSchema>) => {
      // Extract the report HTML
      const reportHtml = await extractReportHtml();

      // Call the new follow-up API endpoint
      const res = await fetch(
        `${API_URL}/v1/workspaces/${wsId}/users/${userId}/follow-up`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subject: values.subject,
            content: reportHtml,
            to_email: values.to_email || userEmail || '',
            post_id: undefined,
          }),
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to send follow-up email');
      }

      const data = await res.json();
      return data as {
        status: string;
        mail_id?: string;
        emailSent: boolean;
        message: string;
      };
    },
    onSuccess: () => {
      toast.success('Follow-up sent');
    },
    onError: (err: any) => {
      console.log(err);
      toast.error(err?.message || 'An unexpected error occurred');
    },
  });

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="grid h-full w-full grid-cols-2 gap-6">
        {/* Left Column - Form and Attendance */}
        <div className="flex flex-col space-y-4 overflow-y-auto p-6">
          <div>
            <h2 className="font-semibold text-lg">
              {t('users.follow_up.compose_email')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('users.follow_up.compose_email_description')}
            </p>
          </div>

          {/* Warning for missing minimum attendance */}
          {(minimumAttendance === undefined || minimumAttendance === null) && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="text-destructive">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <title>Warning Icon</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-destructive text-sm">
                      {t('users.follow_up.minimum_attendance_not_set')}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {t(
                        'users.follow_up.minimum_attendance_not_set_description'
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Group and Manager Selection */}
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div className="grid gap-2">
                <label className="font-medium text-sm">
                  {t('users.follow_up.group')}
                </label>
                <Combobox
                  key="group-combobox"
                  t={t}
                  options={groupOptions}
                  selected={groupId ?? ''}
                  placeholder={t('users.follow_up.select_group')}
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
                <label className="font-medium text-sm">
                  {t('users.follow_up.group_manager')}
                </label>
                <Combobox
                  key="manager-combobox"
                  t={t}
                  options={managerOptions}
                  selected={selectedManagerName ?? ''}
                  placeholder={t('users.follow_up.select_manager')}
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
                <label className="font-medium text-sm" htmlFor="to_email">
                  {t('users.follow_up.to')}
                </label>
                <Input
                  id="to_email"
                  value={form.watch('to_email')}
                  onChange={(e) => form.setValue('to_email', e.target.value)}
                  placeholder={
                    userEmail || t('users.follow_up.user_email_placeholder')
                  }
                  disabled
                />
              </div>

              <div className="grid gap-2">
                <label className="font-medium text-sm" htmlFor="source_name">
                  {t('users.follow_up.sender_name')}
                </label>
                <Input
                  id="source_name"
                  value={form.watch('source_name')}
                  onChange={(e) => form.setValue('source_name', e.target.value)}
                  placeholder={
                    emailCredentials?.source_name ||
                    t('users.follow_up.sender_name_placeholder')
                  }
                  disabled
                />
              </div>

              <div className="grid gap-2">
                <label className="font-medium text-sm" htmlFor="source_email">
                  {t('users.follow_up.sender_email')}
                </label>
                <Input
                  id="source_email"
                  type="email"
                  value={form.watch('source_email')}
                  onChange={(e) =>
                    form.setValue('source_email', e.target.value)
                  }
                  placeholder={
                    emailCredentials?.source_email ||
                    t('users.follow_up.sender_email_placeholder')
                  }
                  disabled
                />
              </div>

              <div className="grid gap-2">
                <label className="font-medium text-sm" htmlFor="subject">
                  {t('users.follow_up.subject')}
                </label>
                <Input
                  id="subject"
                  value={form.watch('subject')}
                  onChange={(e) => form.setValue('subject', e.target.value)}
                  placeholder={t('users.follow_up.subject_placeholder')}
                  disabled
                />
              </div>

              <div className="grid gap-2">
                <label className="font-medium text-sm" htmlFor="content">
                  {t('users.follow_up.report_content')}
                </label>
                <Textarea
                  id="content"
                  className="min-h-32 resize-none"
                  value={form.watch('content')}
                  onChange={(e) => form.setValue('content', e.target.value)}
                  placeholder={t('users.follow_up.report_content_placeholder')}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={
                    mutation.isPending ||
                    !effectiveManagerName ||
                    !emailCredentials?.source_name ||
                    !emailCredentials?.source_email
                  }
                  onClick={() => mutation.mutate(form.getValues())}
                  className="w-full sm:w-auto"
                  title={
                    !effectiveManagerName
                      ? t('users.follow_up.select_manager_warning')
                      : !emailCredentials?.source_name ||
                          !emailCredentials?.source_email
                        ? t('users.follow_up.email_credentials_missing')
                        : undefined
                  }
                >
                  {mutation.isPending
                    ? t('users.follow_up.sending')
                    : t('users.follow_up.send_email')}
                </Button>
              </div>
              {!effectiveManagerName && (
                <p className="text-right text-destructive text-sm">
                  {t('users.follow_up.select_manager_warning')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Attendance Section */}
          {userName && canCheckUserAttendance && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t('users.follow_up.attendance_overview')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <UserMonthAttendance
                  wsId={wsId}
                  user={{
                    id: userId,
                    full_name: userName,
                    href: `/${wsId}/users/${userId}`,
                    archived: userArchived,
                    archived_until: userArchivedUntil,
                    note: userNote,
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
                    {t('users.follow_up.performance_metrics')}
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
        <div className="flex h-full flex-col overflow-hidden">
          <div className="p-6 pb-4">
            <h2 className="font-semibold text-lg">
              {t('users.follow_up.live_preview')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('users.follow_up.live_preview_description')}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {mockReport && configsQuery.data ? (
              <LeadGenerationPreview
                t={t}
                getConfig={(id: string) =>
                  configsQuery.data?.find((c) => c.id === id)?.value
                }
                parseDynamicText={parseDynamicText}
                leadData={{
                  leadName: userName,
                  className: selectedGroup?.name ?? undefined,
                  teacherName: effectiveManagerName,
                  avgScore: finalScore,
                  comments: parseDynamicText(form.watch('content')) as string,
                  currentDate: new Date().toLocaleDateString(),
                  minimumAttendance: minimumAttendance,
                }}
                showCard={false}
                showMissingConfigWarning={true}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="text-muted-foreground">
                    {t('users.follow_up.no_report_data')}
                  </p>
                  {!groupId && (
                    <p className="mt-2 text-muted-foreground text-sm">
                      {t('users.follow_up.no_group_assigned')}
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
