import {
  Calendar,
  ChevronDown,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
} from '@tuturuuu/icons';
import Image from 'next/image';
import type React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../alert-dialog';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../dialog';
import { Input } from '../../input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../select';
import { Separator } from '../../separator';
import { Switch } from '../../switch';
import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

export function CalendarConnectionsSettingsContent({
  state,
  className,
}: {
  state: CalendarConnectionsManagerState;
  className?: string;
}) {
  const {
    accounts,
    calendarsByAccount,
    createCalendarMutation,
    customCalendars,
    defaultSourceData,
    defaultSourceMutation,
    deleteCalendarMutation,
    disconnectingId,
    disconnectMutation,
    expandedAccounts,
    getCalendarColor,
    googleAuthMutation,
    handleToggle,
    microsoftAuthMutation,
    newCalendarName,
    resetCalendarDataMutation,
    setNewCalendarName,
    setShowCreateCalendarDialog,
    showCreateCalendarDialog,
    systemCalendars,
    t,
    togglingIds,
    togglingTuturuuuIds,
    toggleAccountExpanded,
    toggleWorkspaceCalendarMutation,
  } = state;

  return (
    <div className={className ? `space-y-4 ${className}` : 'space-y-4'}>
      <div className="space-y-4 py-4">
        <div className="space-y-2 rounded-md border p-3">
          <div>
            <h4 className="font-medium text-sm">
              {t('default_calendar_source') || 'Default calendar source'}
            </h4>
            <p className="text-muted-foreground text-xs">
              {t('default_calendar_source_desc') ||
                'New events use this calendar unless you choose another source.'}
            </p>
          </div>
          <Select
            value={defaultSourceData?.defaultSource?.id}
            onValueChange={(value) => defaultSourceMutation.mutate(value)}
            disabled={
              !defaultSourceData?.options.length ||
              defaultSourceMutation.isPending
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose default calendar" />
            </SelectTrigger>
            <SelectContent>
              {defaultSourceData?.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: option.color ?? undefined,
                      }}
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
        </div>

        {/* Tuturuuu Calendars Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image
                src="/icon-512x512.png"
                alt="Tuturuuu"
                width={24}
                height={24}
              />
              <span className="font-medium text-sm">
                {t('tuturuuu_calendars') || 'Tuturuuu Calendars'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setShowCreateCalendarDialog(true)}
              disabled={createCalendarMutation.isPending}
            >
              {createCalendarMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              {t('new') || 'New'}
            </Button>
            <Dialog
              open={showCreateCalendarDialog}
              onOpenChange={(open) => {
                setShowCreateCalendarDialog(open);
                if (!open) setNewCalendarName('');
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('create_calendar')}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    value={newCalendarName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewCalendarName(e.target.value)
                    }
                    placeholder={
                      t('enter_calendar_name') || 'Enter calendar name'
                    }
                    autoFocus
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter' && newCalendarName.trim()) {
                        createCalendarMutation.mutate({
                          name: newCalendarName.trim(),
                        });
                        setShowCreateCalendarDialog(false);
                        setNewCalendarName('');
                      }
                    }}
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      if (newCalendarName.trim()) {
                        createCalendarMutation.mutate({
                          name: newCalendarName.trim(),
                        });
                        setShowCreateCalendarDialog(false);
                        setNewCalendarName('');
                      }
                    }}
                    disabled={
                      !newCalendarName.trim() ||
                      createCalendarMutation.isPending
                    }
                  >
                    {createCalendarMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('create')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* System Calendars */}
          <div className="space-y-1">
            {systemCalendars.map((cal) => {
              const Icon =
                cal.calendar_type === 'primary'
                  ? Calendar
                  : cal.calendar_type === 'tasks'
                    ? Target
                    : cal.calendar_type === 'habits'
                      ? Sparkles
                      : Calendar;
              return (
                <div
                  key={cal.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                      style={{
                        backgroundColor: `${getCalendarColor(cal.color || 'BLUE')}20`,
                      }}
                    >
                      <Icon
                        className="h-3 w-3"
                        style={{
                          color: getCalendarColor(cal.color || 'BLUE'),
                        }}
                      />
                    </div>
                    <span
                      className="line-clamp-1 break-all text-sm"
                      title={cal.name}
                    >
                      {cal.name}
                    </span>
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </div>
                  <Switch
                    checked={cal.is_enabled}
                    onCheckedChange={() =>
                      toggleWorkspaceCalendarMutation.mutate({
                        id: cal.id,
                        is_enabled: !cal.is_enabled,
                      })
                    }
                    disabled={togglingTuturuuuIds.has(cal.id)}
                  />
                </div>
              );
            })}
          </div>

          {/* Custom Calendars */}
          {customCalendars.length > 0 && (
            <div className="space-y-1">
              <p className="px-2 text-muted-foreground text-xs">
                {t('custom_calendars') || 'Custom'}
              </p>
              {customCalendars.map((cal) => (
                <div
                  key={cal.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor: getCalendarColor(cal.color || 'BLUE'),
                      }}
                    />
                    <span
                      className="line-clamp-1 break-all text-sm"
                      title={cal.name}
                    >
                      {cal.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteCalendarMutation.mutate(cal.id)}
                      disabled={deleteCalendarMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <Switch
                      checked={cal.is_enabled}
                      onCheckedChange={() =>
                        toggleWorkspaceCalendarMutation.mutate({
                          id: cal.id,
                          is_enabled: !cal.is_enabled,
                        })
                      }
                      disabled={togglingTuturuuuIds.has(cal.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Connected accounts with calendars */}
        {accounts.map((account) => (
          <Collapsible
            key={account.id}
            open={expandedAccounts.has(account.id)}
            onOpenChange={() => toggleAccountExpanded(account.id)}
          >
            <div className="rounded-lg border">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-3 transition-colors hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Image
                      src={
                        account.provider === 'google'
                          ? '/media/logos/google.svg'
                          : '/media/logos/microsoft.svg'
                      }
                      alt={account.provider}
                      width={18}
                      height={18}
                    />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-sm">
                      {account.account_name ||
                        account.account_email ||
                        t('unknown_account')}
                    </p>
                    {account.account_email && account.account_name && (
                      <p className="text-muted-foreground text-xs">
                        {account.account_email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {account.provider}
                  </Badge>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${expandedAccounts.has(account.id) ? 'rotate-180' : ''}`}
                  />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <Separator />
                <div className="space-y-2 p-3">
                  {(calendarsByAccount[account.id] || []).length > 0 ? (
                    (calendarsByAccount[account.id] || []).map((cal) => (
                      <div
                        key={cal.id}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{
                              backgroundColor: cal.color || '#4285f4',
                            }}
                          />
                          <span
                            className="line-clamp-1 break-all text-sm"
                            title={cal.calendar_name}
                          >
                            {cal.calendar_name}
                          </span>
                        </div>
                        <Switch
                          checked={cal.is_enabled}
                          onCheckedChange={() =>
                            handleToggle(cal.id, cal.is_enabled, {
                              calendar_id: cal.calendar_id,
                              calendar_name: cal.calendar_name,
                              color: cal.color,
                              connectionExists: cal.connectionExists,
                              accountId: cal.accountId,
                            })
                          }
                          disabled={togglingIds.has(cal.id)}
                        />
                      </div>
                    ))
                  ) : (
                    <p className="py-2 text-center text-muted-foreground text-xs">
                      {t('no_calendars_found')}
                    </p>
                  )}

                  <Separator className="my-2" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => disconnectMutation.mutate(account.id)}
                    disabled={disconnectingId === account.id}
                  >
                    {disconnectingId === account.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {t('disconnect')}
                  </Button>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}

        {/* Add new account buttons */}
        <div className="space-y-2 pt-2">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t('add_account')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-center"
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
              className="gap-2 text-center"
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

        {/* Danger Zone */}
        <Separator />
        <div className="space-y-2">
          <p className="font-medium text-destructive text-xs uppercase tracking-wider">
            {t('danger_zone') || 'Danger Zone'}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="w-full gap-2"
                disabled={resetCalendarDataMutation.isPending}
              >
                {resetCalendarDataMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {t('reset_calendar_data') || 'Reset Calendar Data'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('reset_calendar_confirm_title') ||
                    'Reset all calendar data?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('reset_calendar_confirm_desc') ||
                    'This will permanently delete all calendar events, disconnect all linked accounts (Google, Microsoft), and remove custom calendars. System calendars will be preserved but emptied. This action cannot be undone.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel') || 'Cancel'}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => resetCalendarDataMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('reset_all_data') || 'Reset All Data'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
