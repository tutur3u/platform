import { Clock } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { setSnooze, snoozeChoices, snoozeUntil } from '../fleet/snooze';
import { useI18n } from '../i18n';

export function SnoozeMenu({
  decisionId,
  deadlineAt,
}: {
  decisionId: string;
  deadlineAt?: string;
}) {
  const { t } = useI18n();
  return (
    // Non-modal: no scroll lock, so no injected stylesheet under the CSP.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <Clock />
          {t('snooze.label')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>{t('snooze.label')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {snoozeChoices.map((choice) => {
          const until = snoozeUntil(choice, Date.now(), deadlineAt);
          return (
            <DropdownMenuItem
              key={choice}
              disabled={until === null}
              onSelect={() => {
                const at = snoozeUntil(choice, Date.now(), deadlineAt);
                if (at !== null) setSnooze(decisionId, at);
              }}
            >
              {t(`snooze.${choice}`)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
