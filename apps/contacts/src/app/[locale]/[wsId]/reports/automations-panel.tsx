'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  MailCheck,
  Save,
  ShieldCheck,
} from '@tuturuuu/icons';
import {
  getPeriodicReportSchedules,
  listWorkspaceReportGroups,
  type PeriodicReportCadence,
  type UpsertPeriodicReportSchedulePayload,
  upsertPeriodicReportSchedule,
} from '@tuturuuu/internal-api/reports';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

const cadences: PeriodicReportCadence[] = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
];

function ReadinessItem({ label, ready }: { label: string; ready: boolean }) {
  const t = useTranslations('reports-hub');
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="text-sm">{label}</span>
      <Badge variant={ready ? 'success' : 'secondary'}>
        {ready ? (
          <CheckCircle2 className="mr-1 h-3 w-3" />
        ) : (
          <AlertTriangle className="mr-1 h-3 w-3" />
        )}
        {ready ? t('ready') : t('required')}
      </Badge>
    </div>
  );
}

export default function AutomationsPanel({
  canManage,
  wsId,
}: {
  canManage: boolean;
  wsId: string;
}) {
  const t = useTranslations('reports-hub');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['periodic-report-schedules', wsId],
    queryFn: () => getPeriodicReportSchedules(wsId),
  });
  const groupsQuery = useQuery({
    queryFn: () => listWorkspaceReportGroups(wsId),
    queryKey: ['periodic-report-groups', wsId],
  });
  const [editingCadence, setEditingCadence] =
    useState<PeriodicReportCadence | null>(null);
  const [overrideGroupId, setOverrideGroupId] = useState('');
  const [overrideCadence, setOverrideCadence] =
    useState<PeriodicReportCadence>('monthly');
  const [editingOverride, setEditingOverride] = useState(false);
  const saveMutation = useMutation({
    mutationFn: (payload: UpsertPeriodicReportSchedulePayload) =>
      upsertPeriodicReportSchedule(wsId, payload),
    onSuccess: async () => {
      toast.success(t('automation_saved'));
      setEditingCadence(null);
      await queryClient.invalidateQueries({
        queryKey: ['periodic-report-schedules', wsId],
      });
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-56 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!query.data || query.isError) {
    return (
      <Card>
        <CardContent className="flex min-h-44 flex-col items-center justify-center gap-3 p-4 text-center">
          <p>{t('automation_load_error')}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t('retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = query.data;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            {t('delivery_readiness')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <ReadinessItem
            label={t('global_email_gate')}
            ready={data.emailDelivery.globalGateEnabled}
          />
          <ReadinessItem
            label={t('periodic_email_gate')}
            ready={data.emailDelivery.periodicGateEnabled}
          />
          <ReadinessItem
            label={t('sender_ready')}
            ready={data.emailDelivery.senderConfigured}
          />
          <ReadinessItem
            label={t('workspace_timezone')}
            ready={Boolean(data.workspaceTimezone)}
          />
          <p className="text-muted-foreground text-xs md:col-span-2">
            {t('delivery_readiness_description')}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        {cadences.map((cadence) => {
          const schedule = data.defaults.find(
            (candidate) => candidate.cadence === cadence
          );
          return (
            <ScheduleCard
              key={cadence}
              cadence={cadence}
              canManage={canManage && data.canManage}
              defaultTimezone={data.workspaceTimezone ?? ''}
              isEditing={editingCadence === cadence}
              isSaving={saveMutation.isPending}
              onEditingChange={(editing) =>
                setEditingCadence(editing ? cadence : null)
              }
              onSave={(payload) => saveMutation.mutate(payload)}
              schedule={schedule}
            />
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('group_overrides')}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {t('group_overrides_description')}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={overrideGroupId} onValueChange={setOverrideGroupId}>
              <SelectTrigger>
                <SelectValue placeholder={t('choose_group')} />
              </SelectTrigger>
              <SelectContent>
                {(groupsQuery.data?.groups ?? []).map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name ?? t('unknown_group')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={overrideCadence}
              onValueChange={(value) =>
                setOverrideCadence(value as PeriodicReportCadence)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cadences.map((cadence) => (
                  <SelectItem key={cadence} value={cadence}>
                    {t(cadence)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {overrideGroupId ? (
            <ScheduleCard
              key={`${overrideGroupId}-${overrideCadence}`}
              cadence={overrideCadence}
              canManage={canManage && data.canManage}
              defaultTimezone={data.workspaceTimezone ?? ''}
              groupId={overrideGroupId}
              isEditing={editingOverride}
              isSaving={saveMutation.isPending}
              onEditingChange={setEditingOverride}
              onSave={(payload) => saveMutation.mutate(payload)}
              schedule={data.overrides.find(
                (candidate) =>
                  candidate.group_id === overrideGroupId &&
                  candidate.cadence === overrideCadence
              )}
            />
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              {t('choose_group_to_override')}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <HistoryCard
          icon={<CalendarClock className="h-4 w-4" />}
          title={t('recent_generation_runs')}
          empty={t('no_generation_runs')}
          rows={data.recentRuns.map((run) => ({
            detail: `${run.period_start} – ${run.period_end}`,
            label: `${t(run.cadence)} · ${run.status}`,
            tone: run.last_error,
          }))}
        />
        <HistoryCard
          icon={<MailCheck className="h-4 w-4" />}
          title={t('recent_delivery_attempts')}
          empty={t('no_delivery_attempts')}
          rows={data.recentDeliveries.map((attempt) => ({
            detail: new Date(attempt.attempted_at).toLocaleString(),
            label: attempt.status,
            tone: attempt.error_message,
          }))}
        />
      </div>
    </div>
  );
}

function ScheduleCard({
  cadence,
  canManage,
  defaultTimezone,
  groupId,
  isEditing,
  isSaving,
  onEditingChange,
  onSave,
  schedule,
}: {
  cadence: PeriodicReportCadence;
  canManage: boolean;
  defaultTimezone: string;
  groupId?: string;
  isEditing: boolean;
  isSaving: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (payload: UpsertPeriodicReportSchedulePayload) => void;
  schedule:
    | Awaited<ReturnType<typeof getPeriodicReportSchedules>>['defaults'][number]
    | undefined;
}) {
  const t = useTranslations('reports-hub');
  const [enabled, setEnabled] = useState(schedule?.enabled ?? false);
  const [generationMode, setGenerationMode] = useState<'manual' | 'ai'>(
    schedule?.generation_mode ?? 'manual'
  );
  const [deliveryTime, setDeliveryTime] = useState(
    schedule?.delivery_time.slice(0, 5) ?? '09:00'
  );
  const [timezone, setTimezone] = useState(
    schedule?.timezone ?? defaultTimezone
  );
  const [instruction, setInstruction] = useState(
    schedule?.manager_instruction ?? ''
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="capitalize">{t(cadence)}</CardTitle>
          <p className="mt-1 text-muted-foreground text-xs">
            {schedule?.next_run_at
              ? t('next_run', {
                  date: new Date(schedule.next_run_at).toLocaleString(),
                })
              : t('not_scheduled')}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={!canManage || !isEditing}
          onCheckedChange={setEnabled}
          aria-label={t('enable_automation', { cadence: t(cadence) })}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {isEditing ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={generationMode}
                onValueChange={(value) =>
                  setGenerationMode(value as 'manual' | 'ai')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t('manual_draft')}</SelectItem>
                  <SelectItem value="ai">{t('ai_draft')}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="time"
                value={deliveryTime}
                onChange={(event) => setDeliveryTime(event.target.value)}
                aria-label={t('delivery_time')}
              />
            </div>
            <Input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Asia/Ho_Chi_Minh"
              aria-label={t('workspace_timezone')}
            />
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder={t('manager_instruction')}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onEditingChange(false)}>
                {t('cancel')}
              </Button>
              <Button
                disabled={isSaving || !timezone.trim()}
                onClick={() =>
                  onSave({
                    cadence,
                    delivery_time: deliveryTime,
                    enabled,
                    generation_mode: generationMode,
                    group_id: groupId ?? null,
                    manager_instruction: instruction || null,
                    timezone: timezone.trim(),
                  })
                }
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('save')}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={enabled ? 'success' : 'secondary'}>
              {enabled ? t('enabled') : t('disabled')}
            </Badge>
            <Badge variant="outline">
              <Clock3 className="mr-1 h-3 w-3" />
              {generationMode === 'ai' ? t('ai_draft') : t('manual_draft')}
              {' · '}
              {deliveryTime}
            </Badge>
            {canManage && (
              <Button
                className="ml-auto"
                size="sm"
                variant="outline"
                onClick={() => onEditingChange(true)}
              >
                {t('configure')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryCard({
  empty,
  icon,
  rows,
  title,
}: {
  empty: string;
  icon: ReactNode;
  rows: Array<{ detail: string; label: string; tone: string | null }>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          rows.map((row, index) => (
            <div
              key={`${row.label}-${row.detail}-${index}`}
              className="rounded-lg border p-3"
            >
              <p className="font-medium text-sm">{row.label}</p>
              <p className="text-muted-foreground text-xs">{row.detail}</p>
              {row.tone && (
                <p className="mt-1 text-destructive text-xs">{row.tone}</p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
