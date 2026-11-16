'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { type FormEvent, useId, useReducer, useState } from 'react';
import {
  financeReducer,
  formatCents,
  initialFinanceState,
  parseAmountToCents,
  summarizeTransactions,
  type TransactionKind,
} from '@/lib/showcase/finance';
import { hasRoom, SHOWCASE_LIMITS } from '@/lib/showcase/limits';
import { DemoPanel, FieldMessage } from '../demo-panel';
import { fieldLabel, focusRing, selectField } from '../styles';

type FormError = null | 'label' | 'amount';

export function FinanceDemo() {
  const [state, dispatch] = useReducer(financeReducer, initialFinanceState);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [error, setError] = useState<FormError>(null);
  const labelId = useId();
  const amountId = useId();
  const kindId = useId();
  const errorId = useId();
  const full = !hasRoom(state.transactions, SHOWCASE_LIMITS.listItems);
  const totals = summarizeTransactions(state.transactions);

  const clearForm = () => {
    setLabel('');
    setAmount('');
    setError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (full) return;
    if (!label.trim()) return setError('label');
    const amountCents = parseAmountToCents(amount);
    if (amountCents === null) return setError('amount');
    dispatch({ type: 'add', label, kind, amountCents });
    clearForm();
  };

  return (
    <DemoPanel
      label="Finance demo"
      onReset={() => {
        dispatch({ type: 'reset' });
        clearForm();
        setKind('expense');
      }}
    >
      <dl aria-live="polite" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Income" value={formatCents(totals.incomeCents)} />
        <Stat label="Expenses" value={formatCents(totals.expenseCents)} />
        <Stat
          emphasis
          label="Balance"
          value={formatCents(totals.balanceCents)}
        />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <form className="space-y-3" noValidate onSubmit={submit}>
          <h3 className="font-semibold text-sm">Add transaction</h3>
          <div className="space-y-1.5">
            <label className={fieldLabel} htmlFor={labelId}>
              Description
            </label>
            <Input
              aria-describedby={error === 'label' ? errorId : undefined}
              aria-invalid={error === 'label'}
              autoComplete="off"
              disabled={full}
              id={labelId}
              maxLength={SHOWCASE_LIMITS.titleLength}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Team lunch"
              value={label}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={fieldLabel} htmlFor={amountId}>
                Amount (USD)
              </label>
              <Input
                aria-describedby={error === 'amount' ? errorId : undefined}
                aria-invalid={error === 'amount'}
                autoComplete="off"
                disabled={full}
                id={amountId}
                inputMode="decimal"
                maxLength={14}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="42.50"
                value={amount}
              />
            </div>
            <div className="space-y-1.5">
              <label className={fieldLabel} htmlFor={kindId}>
                Type
              </label>
              <select
                className={selectField}
                disabled={full}
                id={kindId}
                onChange={(event) =>
                  setKind(event.target.value as TransactionKind)
                }
                value={kind}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
          </div>
          {error ? (
            <FieldMessage id={errorId}>
              {error === 'label'
                ? 'Add a description.'
                : 'Enter an amount above zero, like 42.50.'}
            </FieldMessage>
          ) : null}
          {full ? (
            <p className="text-muted-foreground text-sm">
              The ledger holds {SHOWCASE_LIMITS.listItems} transactions. Remove
              one or reset.
            </p>
          ) : null}
          <Button className="w-full" disabled={full} type="submit">
            Add transaction
          </Button>
        </form>

        <div className="min-w-0 space-y-3">
          <h3 className="font-semibold text-sm">Transactions</h3>
          {state.transactions.length === 0 ? (
            <p className="rounded-md border border-border border-dashed p-4 text-muted-foreground text-sm">
              No transactions. Add one to see the totals update.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {state.transactions.map((transaction) => (
                <li
                  key={transaction.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm">{transaction.label}</p>
                    <p className="text-muted-foreground text-xs">
                      {transaction.kind === 'income' ? 'Income' : 'Expense'}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium text-sm tabular-nums">
                    {transaction.kind === 'income' ? '+' : '−'}
                    {formatCents(transaction.amountCents)}
                  </span>
                  <button
                    aria-label={`Remove ${transaction.label}`}
                    className={cn(
                      'shrink-0 rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground',
                      focusRing
                    )}
                    onClick={() =>
                      dispatch({ type: 'remove', id: transaction.id })
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DemoPanel>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg p-4',
        emphasis ? 'bg-primary text-primary-foreground' : 'bg-muted/50'
      )}
    >
      <dt
        className={cn(
          'text-sm',
          emphasis ? 'opacity-80' : 'text-muted-foreground'
        )}
      >
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-2xl tabular-nums tracking-tight">
        {value}
      </dd>
    </div>
  );
}
