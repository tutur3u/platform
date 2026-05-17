'use client';

import { Calculator, ReceiptText } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

type FeeLine = {
  amount: number;
  label: string;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  style: 'currency',
});

function parseNumber(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(value: number) {
  return currencyFormatter.format(Math.max(0, value));
}

export function CheckoutFeeCalculator() {
  const t = useTranslations('inventory.checkout.calculator');
  const [subtotal, setSubtotal] = useState('480');
  const [processingPercent, setProcessingPercent] = useState('2.9');
  const [processingFixed, setProcessingFixed] = useState('0.3');
  const [platformPercent, setPlatformPercent] = useState('4');
  const [conversionPercent, setConversionPercent] = useState('1');

  const estimate = useMemo(() => {
    const gross = parseNumber(subtotal, 0);
    const processing =
      gross * (parseNumber(processingPercent, 0) / 100) +
      parseNumber(processingFixed, 0);
    const platform = gross * (parseNumber(platformPercent, 0) / 100);
    const conversion = gross * (parseNumber(conversionPercent, 0) / 100);
    const totalFees = processing + platform + conversion;
    const net = gross - totalFees;

    const lines: FeeLine[] = [
      { label: t('processingFee'), amount: processing },
      { label: t('platformFee'), amount: platform },
      { label: t('conversionFee'), amount: conversion },
    ];

    return { gross, lines, net, totalFees };
  }, [
    conversionPercent,
    platformPercent,
    processingFixed,
    processingPercent,
    subtotal,
    t,
  ]);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-semibold text-lg">
            <Calculator className="h-5 w-5 text-dynamic-cyan" />
            {t('title')}
          </div>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
            {t('description')}
          </p>
        </div>
        <div className="rounded-md border border-dynamic-green/20 bg-dynamic-green/10 px-3 py-2 text-dynamic-green text-sm">
          {t('netPayout')}: {formatCurrency(estimate.net)}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('subtotal')}</span>
          <input
            className="h-10 rounded-md border border-border bg-background px-3 outline-none transition focus:border-dynamic-cyan"
            inputMode="decimal"
            onChange={(event) => setSubtotal(event.target.value)}
            type="number"
            value={subtotal}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('processingPercent')}</span>
          <input
            className="h-10 rounded-md border border-border bg-background px-3 outline-none transition focus:border-dynamic-cyan"
            inputMode="decimal"
            onChange={(event) => setProcessingPercent(event.target.value)}
            type="number"
            value={processingPercent}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('processingFixed')}</span>
          <input
            className="h-10 rounded-md border border-border bg-background px-3 outline-none transition focus:border-dynamic-cyan"
            inputMode="decimal"
            onChange={(event) => setProcessingFixed(event.target.value)}
            type="number"
            value={processingFixed}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('platformPercent')}</span>
          <input
            className="h-10 rounded-md border border-border bg-background px-3 outline-none transition focus:border-dynamic-cyan"
            inputMode="decimal"
            onChange={(event) => setPlatformPercent(event.target.value)}
            type="number"
            value={platformPercent}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('conversionPercent')}</span>
          <input
            className="h-10 rounded-md border border-border bg-background px-3 outline-none transition focus:border-dynamic-cyan"
            inputMode="decimal"
            onChange={(event) => setConversionPercent(event.target.value)}
            type="number"
            value={conversionPercent}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2 font-medium">
            <ReceiptText className="h-4 w-4 text-dynamic-blue" />
            {t('feeBreakdown')}
          </div>
          <div className="mt-3 grid gap-2">
            {estimate.lines.map((line) => (
              <div
                className="flex items-center justify-between gap-4 text-sm"
                key={line.label}
              >
                <span className="text-muted-foreground">{line.label}</span>
                <span className="font-medium">
                  {formatCurrency(line.amount)}
                </span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between gap-4 border-border border-t pt-3 font-semibold text-sm">
              <span>{t('totalFees')}</span>
              <span>{formatCurrency(estimate.totalFees)}</span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="font-medium">{t('settlementTitle')}</p>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t('customerPays')}</span>
              <span className="font-medium">
                {formatCurrency(estimate.gross)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t('feesHeld')}</span>
              <span className="font-medium">
                {formatCurrency(estimate.totalFees)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">
                {t('merchantReceives')}
              </span>
              <span className="font-medium">
                {formatCurrency(estimate.net)}
              </span>
            </div>
          </div>
          <p className="mt-4 rounded-md border border-dynamic-yellow/20 bg-dynamic-yellow/10 px-3 py-2 text-dynamic-yellow text-xs leading-5">
            {t('auditNote')}
          </p>
        </div>
      </div>
    </section>
  );
}
