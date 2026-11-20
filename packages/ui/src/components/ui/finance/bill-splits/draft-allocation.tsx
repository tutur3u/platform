'use client';

import { useTranslations } from 'next-intl';
import { Button } from '../../button';
import { Checkbox } from '../../checkbox';
import { Input } from '../../input';
import { Label } from '../../label';
import type { DraftLine, DraftPerson, DraftSponsor } from './draft';

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

export function BillSplitDraftLine({
  line,
  people,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  people: readonly DraftPerson[];
  onChange: (line: DraftLine) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations('bill-splits');
  const base = `split-line-${line.id}`;
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${base}-label`}>{t('item')}</Label>
          <Input
            id={`${base}-label`}
            value={line.label}
            maxLength={120}
            onChange={(event) =>
              onChange({ ...line, label: event.target.value })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${base}-amount`}>{t('amount')}</Label>
          <Input
            id={`${base}-amount`}
            value={line.amount}
            maxLength={24}
            inputMode="decimal"
            required
            onChange={(event) =>
              onChange({ ...line, amount: event.target.value })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${base}-mode`}>{t('allocation')}</Label>
          <select
            id={`${base}-mode`}
            className={selectClass}
            value={line.mode}
            onChange={({ target }) => {
              if (
                target.value === 'equal' ||
                target.value === 'percentage' ||
                target.value === 'exact'
              ) {
                onChange({ ...line, mode: target.value });
              }
            }}
          >
            <option value="equal">{t('equal')}</option>
            <option value="percentage">{t('percentage')}</option>
            <option value="exact">{t('exact')}</option>
          </select>
        </div>
      </div>
      <div className="grid gap-2">
        {people.map(({ id, label }) => {
          const included = !line.excluded.includes(id);
          return (
            <div key={id} className="flex flex-wrap items-center gap-3">
              <Checkbox
                id={`${base}-person-${id}`}
                checked={included}
                onCheckedChange={(checked) =>
                  onChange({
                    ...line,
                    excluded: checked
                      ? line.excluded.filter((entry) => entry !== id)
                      : [...line.excluded, id],
                  })
                }
              />
              <Label className="grow" htmlFor={`${base}-person-${id}`}>
                {label}
              </Label>
              {included && line.mode !== 'equal' && (
                <Input
                  aria-label={t('share-for', { name: label })}
                  className="w-28"
                  inputMode="decimal"
                  required
                  maxLength={24}
                  value={line.shares[id] ?? ''}
                  onChange={(event) =>
                    onChange({
                      ...line,
                      shares: { ...line.shares, [id]: event.target.value },
                    })
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      {onRemove && (
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          {t('remove-item')}
        </Button>
      )}
    </div>
  );
}

export function BillSplitDraftTransfer({
  row,
  people,
  sponsor = false,
  onChange,
  onRemove,
}: {
  row: DraftSponsor;
  people: readonly DraftPerson[];
  sponsor?: boolean;
  onChange: (row: DraftSponsor) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('bill-splits');
  const base = `split-obligation-${row.id}`;
  return (
    <div className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${base}-from`}>
          {t(sponsor ? 'sponsor' : 'sender')}
        </Label>
        <select
          id={`${base}-from`}
          className={selectClass}
          value={row.from}
          required
          onChange={(event) => onChange({ ...row, from: event.target.value })}
        >
          <option value="">{t('choose-person')}</option>
          {people.map(({ id, label }) => (
            <option key={id} value={id} disabled={id === row.to}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${base}-to`}>
          {t(sponsor ? 'beneficiary' : 'recipient')}
        </Label>
        <select
          id={`${base}-to`}
          className={selectClass}
          value={row.to}
          required
          onChange={(event) => onChange({ ...row, to: event.target.value })}
        >
          <option value="">{t('choose-person')}</option>
          {people.map(({ id, label }) => (
            <option key={id} value={id} disabled={id === row.from}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${base}-amount`}>
          {t(sponsor ? 'sponsorship-amount' : 'amount')}
        </Label>
        <Input
          id={`${base}-amount`}
          value={row.amount}
          inputMode="decimal"
          required={!sponsor}
          maxLength={24}
          onChange={(event) => onChange({ ...row, amount: event.target.value })}
        />
      </div>
      <Button
        type="button"
        className="justify-self-start"
        size="sm"
        variant="ghost"
        onClick={onRemove}
      >
        {t('remove')}
      </Button>
    </div>
  );
}
