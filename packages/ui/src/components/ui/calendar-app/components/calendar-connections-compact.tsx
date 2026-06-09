import {
  Calendar,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  Settings,
} from '@tuturuuu/icons';
import Image from 'next/image';
import { Badge } from '../../badge';
import { Button } from '../../button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover';
import { Separator } from '../../separator';
import { CalendarConnectionsSettingsContent } from './calendar-connections-settings-content';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

export function CalendarConnectionsCompact({
  state,
}: {
  state: CalendarConnectionsManagerState;
}) {
  const {
    accounts,
    calendarConnections,
    calendarsByAccount,
    enabledCount,
    expandedPopoverAccounts,
    getCalendarColor,
    googleAuthMutation,
    handleToggle,
    hasConnectedAccounts,
    isLoadingCalendars,
    manualSyncDisabled,
    microsoftAuthMutation,
    setExpandedPopoverAccounts,
    syncHealth,
    syncMutation,
    syncStatusStyles,
    syncToTuturuuu,
    t,
    togglingIds,
    togglingTuturuuuIds,
    toggleWorkspaceCalendarMutation,
    userEmail,
    workspaceCalendars,
  } = state;

  return (
    <div className="flex items-center gap-2">
      {/* Quick calendar visibility toggle */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">{t('calendars')}</span>
            {enabledCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {enabledCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-sm">
                  {t('visible_calendars')}
                </h4>
                <p className="text-muted-foreground text-xs">
                  {enabledCount} {t('calendars_selected') || 'selected'}
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{t('manage_calendar_accounts')}</DialogTitle>
                    <DialogDescription>
                      {t('manage_calendar_accounts_desc')}
                    </DialogDescription>
                  </DialogHeader>

                  <CalendarConnectionsSettingsContent state={state} />
                </DialogContent>
              </Dialog>
            </div>

            {!hasConnectedAccounts && (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    {t('connect_calendar_accounts') ||
                      'Connect calendar accounts'}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('connect_calendar_accounts_desc') ||
                      'Link Google or Outlook to keep external calendars visible and continuously synchronized.'}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => googleAuthMutation.mutate()}
                    disabled={googleAuthMutation.isPending}
                  >
                    {googleAuthMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Image
                        src="/media/logos/google.svg"
                        alt="Google"
                        width={16}
                        height={16}
                      />
                    )}
                    {t('google')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => microsoftAuthMutation.mutate()}
                    disabled={microsoftAuthMutation.isPending}
                  >
                    {microsoftAuthMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Image
                        src="/media/logos/microsoft.svg"
                        alt="Microsoft"
                        width={16}
                        height={16}
                      />
                    )}
                    {t('outlook')}
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            {/* Calendar list grouped by source */}
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {isLoadingCalendars ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Tuturuuu Calendars */}
                  {workspaceCalendars.length > 0 && (
                    <Collapsible
                      open={expandedPopoverAccounts.has('tuturuuu')}
                      onOpenChange={(open) => {
                        setExpandedPopoverAccounts((prev) => {
                          const next = new Set(prev);
                          if (open) next.add('tuturuuu');
                          else next.delete('tuturuuu');
                          return next;
                        });
                      }}
                    >
                      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                        <ChevronDown
                          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${expandedPopoverAccounts.has('tuturuuu') ? '' : '-rotate-90'}`}
                        />
                        <Image
                          src="/icon-512x512.png"
                          alt="Tuturuuu"
                          width={14}
                          height={14}
                        />
                        <div className="flex min-w-0 flex-1 flex-col text-left">
                          <span className="font-medium text-muted-foreground text-xs">
                            {t('tuturuuu_calendars') || 'Tuturuuu'}
                          </span>
                          {userEmail && (
                            <span className="truncate text-[10px] text-muted-foreground">
                              {userEmail}
                            </span>
                          )}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-1 pt-1">
                        {workspaceCalendars.map((cal) => (
                          <div
                            key={cal.id}
                            className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full"
                                style={{
                                  backgroundColor: getCalendarColor(
                                    cal.color || 'BLUE'
                                  ),
                                }}
                              />
                              <span className="line-clamp-1 max-w-45 break-all text-sm">
                                {cal.name}
                              </span>
                              {cal.is_system && (
                                <Lock className="h-2.5 w-2.5 text-muted-foreground" />
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() =>
                                toggleWorkspaceCalendarMutation.mutate({
                                  id: cal.id,
                                  is_enabled: !cal.is_enabled,
                                })
                              }
                              disabled={togglingTuturuuuIds.has(cal.id)}
                            >
                              {togglingTuturuuuIds.has(cal.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : cal.is_enabled ? (
                                <Eye className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* External accounts calendars */}
                  {accounts.map((account) => {
                    const accountCals = calendarsByAccount[account.id] || [];
                    if (accountCals.length === 0) return null;
                    const accountKey = `account-${account.id}`;

                    return (
                      <Collapsible
                        key={account.id}
                        open={expandedPopoverAccounts.has(accountKey)}
                        onOpenChange={(open) => {
                          setExpandedPopoverAccounts((prev) => {
                            const next = new Set(prev);
                            if (open) next.add(accountKey);
                            else next.delete(accountKey);
                            return next;
                          });
                        }}
                      >
                        <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                          <ChevronDown
                            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${expandedPopoverAccounts.has(accountKey) ? '' : '-rotate-90'}`}
                          />
                          <Image
                            src={
                              account.provider === 'google'
                                ? '/media/logos/google.svg'
                                : '/media/logos/microsoft.svg'
                            }
                            alt={account.provider}
                            width={12}
                            height={12}
                          />
                          <span className="min-w-0 flex-1 truncate text-left text-muted-foreground text-xs">
                            {account.account_email || account.account_name}
                          </span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1 pt-1">
                          {accountCals.map((cal) => (
                            <div
                              key={cal.id}
                              className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted/50"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor: cal.color || '#4285f4',
                                  }}
                                />
                                <span className="line-clamp-1 max-w-45 break-all text-sm">
                                  {cal.calendar_name}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() =>
                                  handleToggle(cal.id, cal.is_enabled, {
                                    calendar_id: cal.calendar_id,
                                    calendar_name: cal.calendar_name,
                                    color: cal.color,
                                    connectionExists: cal.connectionExists,
                                    accountId: cal.accountId,
                                  })
                                }
                                disabled={togglingIds.has(cal.id)}
                              >
                                {togglingIds.has(cal.id) ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : cal.is_enabled ? (
                                  <Eye className="h-3.5 w-3.5 text-primary" />
                                ) : (
                                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}

                  {calendarConnections.length === 0 &&
                    workspaceCalendars.length === 0 && (
                      <div className="rounded-lg border border-dashed p-4 text-center">
                        <p className="font-medium text-sm">
                          {t('no_calendars_synced')}
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          {t('choose_calendars_to_show') ||
                            'Connect an account, then choose which calendars should appear here.'}
                        </p>
                      </div>
                    )}
                </>
              )}
            </div>

            <Separator />

            {/* Sync actions */}
            <div className="flex items-center justify-between">
              <div
                className={`rounded-full px-2 py-0.5 text-xs ${syncStatusStyles}`}
              >
                {syncHealth?.state === 'syncing' && (
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                )}
                {syncHealth?.state === 'degraded'
                  ? t('degraded') || 'Degraded'
                  : syncHealth?.state === 'healthy'
                    ? t('healthy') || 'Healthy'
                    : syncHealth?.state === 'disconnected'
                      ? t('connect_accounts') || 'Connect accounts'
                      : t('syncing_calendars') || 'Syncing calendars'}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => syncMutation.mutate()}
                  disabled={manualSyncDisabled}
                  title={t('sync_now') || 'Sync now'}
                >
                  <ExternalLink
                    className={`h-3.5 w-3.5 ${
                      manualSyncDisabled ? 'animate-pulse' : ''
                    }`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => syncToTuturuuu()}
                  disabled={manualSyncDisabled}
                  title={t('sync_from_google')}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${manualSyncDisabled ? 'animate-spin' : ''}`}
                  />
                </Button>
              </div>
            </div>
            {syncHealth?.lastSuccessAt && (
              <p className="text-muted-foreground text-xs">
                {t('last_synced_at') || 'Last synced'}:{' '}
                {new Date(syncHealth.lastSuccessAt).toLocaleString()}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
