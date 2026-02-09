import { ChartColumn } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type { GroupIndicator } from './types';

interface IndicatorTableProps {
  groupIndicators: GroupIndicator[];
  users: WorkspaceUser[];
  canUpdate: boolean;
  getIndicatorValue: (userId: string, indicatorId: string) => string;
  handleValueChange: (
    userId: string,
    indicatorId: string,
    value: string
  ) => void;
  isValuePending: (userId: string, indicatorId: string) => boolean;
  canEditCell: (userId: string, indicatorId: string) => boolean;
  calculateAverage: (userId: string) => string;
  onEditIndicator: (indicator: GroupIndicator) => void;
  onUserClick: (user: WorkspaceUser) => void;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getScoreColorClass(value: string): string {
  if (!value || value === '-') return 'text-muted-foreground';
  const num = parseFloat(value);
  if (Number.isNaN(num)) return 'text-muted-foreground';
  if (num >= 70) return 'text-dynamic-green';
  if (num >= 40) return 'text-dynamic-orange';
  return 'text-dynamic-red';
}

export function IndicatorTable({
  groupIndicators,
  users,
  canUpdate,
  getIndicatorValue,
  handleValueChange,
  isValuePending,
  canEditCell,
  calculateAverage,
  onEditIndicator,
  onUserClick,
}: IndicatorTableProps) {
  const t = useTranslations();
  const tIndicators = useTranslations('ws-user-group-indicators');
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const startEditing = useCallback(
    (userId: string, indicatorId: string) => {
      if (canEditCell(userId, indicatorId)) {
        setEditingCell(`${userId}|${indicatorId}`);
      }
    },
    [canEditCell]
  );

  const stopEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  if (groupIndicators.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <ChartColumn className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="font-semibold text-lg">
            {tIndicators('no_indicators_empty_title')}
          </h3>
          <p className="mt-1 max-w-sm text-center text-muted-foreground text-sm">
            {tIndicators('no_indicators_empty_description')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="relative">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 z-20 border-r bg-muted px-4 py-3 text-center font-semibold text-sm">
                    #
                  </th>
                  <th className="sticky left-10 z-20 min-w-50 border-r bg-muted px-4 py-3 text-left font-semibold text-sm">
                    {t('ws-users.full_name')}
                  </th>
                  {groupIndicators.map((indicator, idx) => (
                    <th
                      key={indicator.id}
                      className="min-w-50 border-r bg-muted px-4 py-3 font-semibold text-sm"
                    >
                      {canUpdate ? (
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1 text-center transition-colors hover:bg-dynamic-purple/10 hover:text-dynamic-purple"
                          onClick={() => onEditIndicator(indicator)}
                        >
                          <span className="line-clamp-2 text-balance break-all">
                            {indicator.name}
                          </span>
                        </button>
                      ) : (
                        <span className="line-clamp-2 text-balance break-all">
                          {indicator.name}
                        </span>
                      )}
                      {idx === groupIndicators.length - 1 && (
                        <Badge
                          variant="outline"
                          className="mt-1 border-dynamic-green/30 text-dynamic-green"
                        >
                          {tIndicators('featured_in_reports')}
                        </Badge>
                      )}
                    </th>
                  ))}
                  <th className="sticky right-0 z-20 min-w-50 border-l bg-muted px-4 py-3 font-semibold text-sm">
                    {t('common.average')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => {
                  const average = calculateAverage(user.id);
                  return (
                    <tr
                      key={user.id}
                      className="border-b transition-colors hover:bg-muted/30"
                    >
                      <td className="sticky left-0 z-10 border-r bg-background px-4 py-2 text-center text-muted-foreground text-sm">
                        {index + 1}
                      </td>
                      <td className="sticky left-10 z-10 border-r bg-background px-4 py-2">
                        <button
                          type="button"
                          onClick={() => onUserClick(user)}
                          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-dynamic-blue/5"
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {getInitials(user.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="line-clamp-1 break-all text-sm">
                            {user.full_name}
                          </span>
                        </button>
                      </td>
                      {groupIndicators.map((indicator) => {
                        const cellKey = `${user.id}|${indicator.id}`;
                        const pending = isValuePending(user.id, indicator.id);
                        const editable = canEditCell(user.id, indicator.id);
                        const isEditing = editingCell === cellKey;
                        const value = getIndicatorValue(user.id, indicator.id);

                        return (
                          <td
                            key={indicator.id}
                            className="border-r px-4 py-2 text-center"
                          >
                            {isEditing ? (
                              <div
                                className={cn(
                                  'inline-flex h-8 w-20 items-center justify-center rounded-md',
                                  pending &&
                                    'bg-dynamic-blue/5 ring-1 ring-dynamic-blue/40'
                                )}
                              >
                                <input
                                  type="number"
                                  step="0.01"
                                  value={value}
                                  onChange={(e) =>
                                    handleValueChange(
                                      user.id,
                                      indicator.id,
                                      e.target.value
                                    )
                                  }
                                  onBlur={stopEditing}
                                  onKeyDown={(e) => {
                                    if (
                                      e.key === 'Enter' ||
                                      e.key === 'Escape'
                                    ) {
                                      stopEditing();
                                    }
                                  }}
                                  className="h-full w-full bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  placeholder="-"
                                  // biome-ignore lint/a11y/noAutofocus: <focus> is appropriate here
                                  autoFocus
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  startEditing(user.id, indicator.id)
                                }
                                disabled={!editable}
                                className={cn(
                                  'inline-flex h-8 w-20 items-center justify-center rounded-md text-sm transition-colors',
                                  editable &&
                                    'cursor-pointer hover:bg-muted/50',
                                  !editable && 'cursor-default',
                                  pending &&
                                    'bg-dynamic-blue/5 ring-1 ring-dynamic-blue/40',
                                  getScoreColorClass(value)
                                )}
                              >
                                {value || '-'}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 border-l bg-background px-4 py-2 text-center">
                        <span
                          className={cn(
                            'font-semibold',
                            getScoreColorClass(average)
                          )}
                        >
                          {average}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
