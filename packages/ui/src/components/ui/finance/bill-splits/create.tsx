'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { submitBillSplit } from '@tuturuuu/internal-api/finance-bill-splits';
import type { WorkspacePerson } from '@tuturuuu/internal-api/people';
import { getFinanceMinorUnitFactor } from '@tuturuuu/utils/finance-money';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '../../button';
import { WorkspacePeoplePicker } from '../../custom/workspace-people-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../dialog';
import { Input } from '../../input';
import { Label } from '../../label';
import { parseSplitAmount } from './amount';
import {
  type DraftExpense,
  type DraftSponsor,
  buildDirectPayments,
  buildExpense,
  emptyExpense,
  emptySponsor,
} from './draft';
import { BillSplitDraftTransfer } from './draft-allocation';
import { BillSplitDraftExpense } from './draft-expense';
import { BillSplitLedgerView } from './ledger';

const personKey = (person: WorkspacePerson) => `${person.kind}:${person.id}`;

export function BillSplitCreate({
  wsId,
  currency,
}: {
  wsId: string;
  currency: string;
}) {
  const t = useTranslations('bill-splits');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [operationId, setOperationId] = useState('');
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('');
  const [payer, setPayer] = useState('');
  const [people, setPeople] = useState<
    (WorkspacePerson & { participantId: string })[]
  >([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [expenses, setExpenses] = useState<DraftExpense[]>([]);
  const [direct, setDirect] = useState<DraftSponsor[]>([]);

  const [preview, setPreview] =
    useState<Awaited<ReturnType<typeof submitBillSplit>>['ledger']>();

  const factor = getFinanceMinorUnitFactor(currency);
  const minorDigits = Math.log10(factor);
  const amountMinor = parseSplitAmount(total, minorDigits);
  const admitted = people.filter(
    ({ participantId }) => !excluded.includes(participantId)
  );
  const canSubmit =
    title.trim() &&
    people.length >= 2 &&
    (advanced ||
      (Number.isSafeInteger(amountMinor) &&
        amountMinor > 0 &&
        admitted.length > 0 &&
        people.some(({ participantId }) => participantId === payer)));
  const draftPeople = people.map((person) => ({
    id: person.participantId,
    label: person.displayName ?? t('unnamed'),
  }));
  const currencyValue = { code: currency, minorDigits };
  const participants = people.map((person) => {
    const shared = {
      id: person.participantId,
      displayName: person.displayName ?? t('unnamed'),
    };
    return person.kind === 'contact'
      ? { ...shared, kind: person.kind, contactId: person.id }
      : { ...shared, kind: person.kind, memberId: person.id };
  });

  const mutation = useMutation({
    mutationFn: (previewOnly: boolean) =>
      submitBillSplit(
        wsId,
        {
          id: operationId,
          title,
          currency: currencyValue,
          participants,
          finalized: true,
          ...(advanced
            ? { direct: buildDirectPayments(direct, currency) }
            : {}),
          expenses: advanced
            ? expenses.map((expense) =>
                buildExpense(expense, draftPeople, currency)
              )
            : [
                {
                  label: title,
                  currency: currencyValue,
                  attendeeIds: admitted.map(
                    ({ participantId }) => participantId
                  ),
                  lines: [
                    {
                      label: title,
                      amountMinor,
                      allocation: {
                        kind: 'equal',
                        participantIds: admitted.map(
                          ({ participantId }) => participantId
                        ),
                      },
                    },
                  ],
                  payments: [{ participantId: payer, amountMinor }],
                },
              ],
        },
        previewOnly
      ),
    onSuccess: ({ ledger }, previewOnly) => {
      if (previewOnly) setPreview(ledger);
      else {
        void queryClient.invalidateQueries({ queryKey: ['bill-splits', wsId] });
        setOpen(false);
      }
    },
  });

  function setDialog(next: boolean) {
    if (mutation.isPending) return;
    if (next) {
      setTitle('');
      setTotal('');
      setPayer('');
      setPeople([]);
      setExcluded([]);
      setAdvanced(false);
      setExpenses([emptyExpense(currency)]);
      setDirect([]);

      setPreview(undefined);
      setOperationId(crypto.randomUUID());
      mutation.reset();
    }
    setOpen(next);
  }

  function edit() {
    setPreview(undefined);
    mutation.reset();
  }

  return (
    <Dialog open={open} onOpenChange={setDialog}>
      <DialogTrigger asChild>
        <Button>{t('create')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('create')}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit && !mutation.isPending) mutation.mutate(!preview);
          }}
        >
          <fieldset disabled={mutation.isPending} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bill-split-title">{t('name')}</Label>
                <Input
                  id="bill-split-title"
                  value={title}
                  maxLength={120}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    edit();
                  }}
                />
              </div>
              {!advanced && (
                <div className="space-y-2">
                  <Label htmlFor="bill-split-total">
                    {t('total', { currency })}
                  </Label>
                  <Input
                    id="bill-split-total"
                    value={total}
                    maxLength={24}
                    inputMode="decimal"
                    onChange={(event) => {
                      setTotal(event.target.value);
                      edit();
                    }}
                  />
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              aria-pressed={advanced}
              onClick={() => {
                if (!advanced && expenses[0] && !expenses[0].label && title) {
                  const first = expenses[0];
                  const line = first.lines[0];
                  setExpenses([
                    {
                      ...first,
                      label: title,
                      lines: line
                        ? [
                            { ...line, amount: total, excluded },
                            ...first.lines.slice(1),
                          ]
                        : first.lines,
                      payments: payer && total ? { [payer]: total } : {},
                    },
                    ...expenses.slice(1),
                  ]);
                }
                setAdvanced(!advanced);
                edit();
              }}
            >
              {t(advanced ? 'simple-split' : 'detailed-split')}
            </Button>
            <WorkspacePeoplePicker
              workspaceId={wsId}
              excludedPeople={people}
              disabled={mutation.isPending}
              onSelect={(person) => {
                const participantId = crypto.randomUUID();
                setPeople([...people, { ...person, participantId }]);
                if (!payer) setPayer(participantId);
                edit();
              }}
              labels={{
                trigger: t('add-person'),
                search: t('search'),
                minimumQuery: t('minimum-search'),
                // loading-text-allowed: picker renders it sr-only beside a skeleton
                loading: t('loading'),
                empty: t('no-people'),
                error: t('list-error'),
                retry: t('retry'),
                contact: t('contact'),
                member: t('member'),
              }}
            />
            {people.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {people.map((person) => (
                  <li
                    key={personKey(person)}
                    className="flex flex-wrap items-center gap-3 p-3 text-sm"
                  >
                    <span className="grow">
                      {person.displayName ?? t('unnamed')}
                    </span>
                    {!advanced && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            payer === person.participantId
                              ? 'default'
                              : 'outline'
                          }
                          aria-pressed={payer === person.participantId}
                          onClick={() => {
                            setPayer(person.participantId);
                            edit();
                          }}
                        >
                          {t('payer')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-pressed={
                            !excluded.includes(person.participantId)
                          }
                          onClick={() => {
                            setExcluded(
                              excluded.includes(person.participantId)
                                ? excluded.filter(
                                    (id) => id !== person.participantId
                                  )
                                : [...excluded, person.participantId]
                            );
                            edit();
                          }}
                        >
                          {t(
                            excluded.includes(person.participantId)
                              ? 'excluded'
                              : 'included'
                          )}
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPeople(
                          people.filter(
                            (item) =>
                              item.participantId !== person.participantId
                          )
                        );
                        if (payer === person.participantId) setPayer('');
                        edit();
                      }}
                    >
                      {t('remove')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {advanced && (
              <div className="space-y-3">
                {expenses.map((expense) => (
                  <BillSplitDraftExpense
                    key={expense.id}
                    expense={expense}
                    people={draftPeople}
                    settlementCurrency={currency}
                    onChange={(next) => {
                      setExpenses(
                        expenses.map((item) =>
                          item.id === expense.id ? next : item
                        )
                      );
                      edit();
                    }}
                    onRemove={
                      expenses.length > 1
                        ? () => {
                            setExpenses(
                              expenses.filter(({ id }) => id !== expense.id)
                            );
                            edit();
                          }
                        : undefined
                    }
                  />
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={expenses.length >= 20}
                  onClick={() => {
                    setExpenses([...expenses, emptyExpense(currency)]);
                    edit();
                  }}
                >
                  {t('add-expense')}
                </Button>
                {direct.map((row) => (
                  <BillSplitDraftTransfer
                    row={row}
                    people={draftPeople}
                    key={row.id}
                    onChange={(next) => {
                      setDirect(
                        direct.map((item) => (item.id === row.id ? next : item))
                      );
                      edit();
                    }}
                    onRemove={() => {
                      setDirect(direct.filter(({ id }) => id !== row.id));
                      edit();
                    }}
                  />
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-2"
                  disabled={direct.length >= 30}
                  onClick={() => {
                    setDirect([...direct, emptySponsor()]);
                    edit();
                  }}
                >
                  {t('add-direct-transfer')}
                </Button>
              </div>
            )}
          </fieldset>
          {preview && (
            <BillSplitLedgerView
              currency={currencyValue}
              ledger={preview}
              participants={participants}
            />
          )}
          {mutation.isError && (
            <p role="alert" className="text-destructive text-sm">
              {t('save-error')}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit || mutation.isPending}>
              {t(mutation.isPending ? 'working' : preview ? 'save' : 'preview')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
