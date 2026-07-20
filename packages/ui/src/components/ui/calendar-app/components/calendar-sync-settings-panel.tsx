import { Badge } from '../../badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../select';
import { Switch } from '../../switch';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

export function CalendarSyncSettingsPanel({
  state,
}: {
  state: CalendarConnectionsManagerState;
}) {
  const { syncPreferencesData, syncPreferencesMutation, t } = state;
  const externalOptions =
    syncPreferencesData?.options.filter(
      (option) => option.provider !== 'tuturuuu'
    ) ?? [];
  const unavailable = syncPreferencesData?.settingsAvailable === false;
  const disabled =
    !syncPreferencesData || unavailable || syncPreferencesMutation.isPending;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <h4 className="font-medium text-sm">
          {t('two_way_sync') || 'Two-way sync'}
        </h4>
        <p className="text-muted-foreground text-xs">
          {t('two_way_sync_desc') ||
            'Control how Tuturuuu imports provider changes and mirrors native events outward.'}
        </p>
      </div>

      {unavailable && (
        <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
          {t('calendar_sync_settings_unavailable') ||
            'Sync controls will be available after the latest calendar migration is applied.'}
        </p>
      )}

      <div className="space-y-3">
        <SyncToggle
          title={t('import_external_changes') || 'Import external changes'}
          description={
            t('import_external_changes_desc') ||
            'Bring Google and Outlook event changes into Tuturuuu.'
          }
          checked={syncPreferencesData?.inboundSyncEnabled ?? true}
          disabled={disabled}
          onCheckedChange={(checked) =>
            syncPreferencesMutation.mutate({ inboundSyncEnabled: checked })
          }
        />
        <SyncToggle
          title={
            t('sync_tuturuuu_events_outward') || 'Sync Tuturuuu events outward'
          }
          description={
            t('sync_tuturuuu_events_outward_desc') ||
            'Mirror native Tuturuuu event creates and edits to a connected provider calendar.'
          }
          checked={syncPreferencesData?.outboundSyncEnabled ?? false}
          disabled={disabled || externalOptions.length === 0}
          onCheckedChange={(checked) =>
            syncPreferencesMutation.mutate({ outboundSyncEnabled: checked })
          }
        />
      </div>

      <Select
        value={syncPreferencesData?.defaultOutboundConnectionId ?? 'none'}
        onValueChange={(value) =>
          syncPreferencesMutation.mutate({
            defaultOutboundConnectionId: value === 'none' ? null : value,
          })
        }
        disabled={disabled || externalOptions.length === 0}
      >
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={
              t('choose_outbound_calendar') || 'Choose outbound calendar'
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            {t('no_outbound_calendar') || 'No outbound calendar'}
          </SelectItem>
          {externalOptions.map((option) => (
            <SelectItem key={option.id} value={option.connectionId}>
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: option.color ?? undefined }}
                />
                <span className="truncate">{option.label}</span>
                <Badge variant="secondary" className="capitalize">
                  {option.provider}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="font-medium text-xs">
            {t('conflict_policy') || 'Conflict policy'}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('latest_write_wins_desc') ||
              'When both sides changed, the most recently written event wins.'}
          </p>
        </div>
        <Badge variant="outline">
          {t('latest_write_wins') || 'Latest write wins'}
        </Badge>
      </div>
    </div>
  );
}

function SyncToggle({
  checked,
  description,
  disabled,
  onCheckedChange,
  title,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}
