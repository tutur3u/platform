'use client';

import { CheckCircle2 } from '@tuturuuu/icons';
import type { InventoryProductFormOptionsResponse } from '@tuturuuu/internal-api/inventory';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { useTranslations } from 'next-intl';
import { SelectField, TextAreaField, TextField } from './operator-form-fields';
import { currency } from './operator-format';
import { CartEditor, type SaleCartLine } from './sale-create-items';

export function SaleCheckout({
  lines,
  onLinesChange,
  currencyCode,
  showUnitOnMobile,
  showWarehouseOnMobile,
  content,
  onContentChange,
  notes,
  onNotesChange,
  walletId,
  onWalletChange,
  categoryId,
  onCategoryChange,
  options,
  canSubmit,
}: {
  lines: SaleCartLine[];
  onLinesChange: (lines: SaleCartLine[]) => void;
  currencyCode: string;
  showUnitOnMobile: boolean;
  showWarehouseOnMobile: boolean;
  content: string;
  onContentChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  walletId: string;
  onWalletChange: (value: string) => void;
  categoryId: string;
  onCategoryChange: (value: string) => void;
  options?: InventoryProductFormOptionsResponse;
  canSubmit: boolean;
}) {
  const t = useTranslations('inventory.operator.commerce.createSale');
  const total = lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0
  );
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const wallet = options?.wallets?.find((row) => row.id === walletId)?.name;
  const category = options?.financeCategories.find(
    (row) => row.id === categoryId
  )?.name;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2 text-sm sm:p-3">
        <span>{t('cartSummary', { items: lines.length, units })}</span>
        <span className="font-semibold tabular-nums">
          {currency(total, currencyCode)}
        </span>
      </div>
      <Accordion
        type="multiple"
        defaultValue={
          !content.trim() || !walletId || !categoryId ? ['payment'] : ['cart']
        }
      >
        <AccordionItem value="cart">
          <AccordionTrigger className="py-3 text-left">
            <span>
              {t('cartTab')}{' '}
              <span className="text-muted-foreground text-xs">
                {t('cartSummary', { items: lines.length, units })}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <CartEditor
              currencyCode={currencyCode}
              lines={lines}
              onChange={onLinesChange}
              showUnitOnMobile={showUnitOnMobile}
              showWarehouseOnMobile={showWarehouseOnMobile}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="payment">
          <AccordionTrigger className="py-3 text-left">
            <span>
              {t('paymentTab')}{' '}
              <span className="text-muted-foreground text-xs">
                {wallet ?? t('chooseWallet')} ·{' '}
                {category ?? t('chooseCategory')}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                className="sm:col-span-2"
                label={t('saleName')}
                maxLength={500}
                onChange={onContentChange}
                placeholder={t('defaultTitle')}
                value={content}
              />
              <SelectField
                allowEmpty={false}
                label={t('wallet')}
                onChange={onWalletChange}
                options={options?.wallets}
                placeholder={t('chooseWallet')}
                searchPlaceholder={t('chooseWallet')}
                value={walletId}
              />
              <SelectField
                allowEmpty={false}
                label={t('category')}
                onChange={onCategoryChange}
                options={(options?.financeCategories ?? []).flatMap((row) =>
                  row.id ? [{ id: row.id, name: row.name }] : []
                )}
                placeholder={t('chooseCategory')}
                searchPlaceholder={t('chooseCategory')}
                value={categoryId}
              />
              <TextAreaField
                className="sm:col-span-2"
                label={t('notes')}
                maxLength={2000}
                onChange={onNotesChange}
                placeholder={t('notesPlaceholder')}
                value={notes}
              />
              {!(options?.wallets?.length ?? 0) ||
              !(options?.financeCategories?.length ?? 0) ? (
                <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm sm:col-span-2">
                  {t('missingSetup')}
                </p>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="review">
          <AccordionTrigger className="py-3 text-left">
            <span>
              {t('reviewTab')}{' '}
              <span className="text-muted-foreground text-xs">
                {canSubmit ? t('reviewReady') : t('reviewRequired')}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="font-semibold">{content || t('untitled')}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('reviewSummary', { items: lines.length, units })}
            </p>
            <p className="mt-2 font-semibold tabular-nums">
              {currency(total, currencyCode)}
            </p>
            {notes ? (
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm">
                {notes}
              </p>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <p className="flex items-start gap-2 text-muted-foreground text-sm leading-6">
        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" />
        {t('stockNotice')}
      </p>
    </div>
  );
}
