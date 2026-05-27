'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import type { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AdminDefaultModelPicker,
  AdminModelAllowlistPicker,
} from './allocation-model-picker';
import { AllocationNumberFields } from './allocation-number-fields';
import type { Allocation } from './allocation-types';

export function EditAllocationDialog({
  allocation,
  isPending,
  onClose,
  onSave,
  t,
}: {
  allocation: Allocation;
  isPending: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Allocation>) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [monthlyCredits, setMonthlyCredits] = useState(
    allocation.monthly_credits
  );
  const [creditsPerSeat, setCreditsPerSeat] = useState<number | null>(
    allocation.credits_per_seat
  );
  const [dailyLimit, setDailyLimit] = useState<number | null>(
    allocation.daily_limit
  );
  const [defaultImageModel, setDefaultImageModel] = useState(
    allocation.default_image_model ?? ''
  );
  const [defaultLanguageModel, setDefaultLanguageModel] = useState(
    allocation.default_language_model ?? ''
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState<number | null>(
    allocation.max_output_tokens_per_request
  );
  const [markupMultiplier, setMarkupMultiplier] = useState(
    allocation.markup_multiplier
  );
  const [selectedModels, setSelectedModels] = useState<string[]>(
    allocation.allowed_models
  );

  const handleSave = () => {
    const nextAllowedModels =
      selectedModels.length === 0
        ? selectedModels
        : Array.from(
            new Set([
              ...selectedModels,
              defaultLanguageModel,
              defaultImageModel,
            ])
          ).filter(Boolean);

    onSave({
      allowed_models: nextAllowedModels,
      credits_per_seat: creditsPerSeat,
      daily_limit: dailyLimit,
      default_image_model: defaultImageModel,
      default_language_model: defaultLanguageModel,
      markup_multiplier: markupMultiplier,
      max_output_tokens_per_request: maxOutputTokens,
      monthly_credits: monthlyCredits,
    });
  };

  const canSave = Boolean(defaultLanguageModel && defaultImageModel);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('edit')} {allocation.tier}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <AllocationNumberFields
            creditsPerSeat={creditsPerSeat}
            dailyLimit={dailyLimit}
            maxOutputTokens={maxOutputTokens}
            monthlyCredits={monthlyCredits}
            setCreditsPerSeat={setCreditsPerSeat}
            setDailyLimit={setDailyLimit}
            setMaxOutputTokens={setMaxOutputTokens}
            setMonthlyCredits={setMonthlyCredits}
            t={t}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('default_language_model')}</Label>
              <AdminDefaultModelPicker
                selectedModels={selectedModels}
                setSelectedModels={setSelectedModels}
                t={t}
                type="language"
                value={defaultLanguageModel}
                onChange={setDefaultLanguageModel}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('default_image_model')}</Label>
              <AdminDefaultModelPicker
                selectedModels={selectedModels}
                setSelectedModels={setSelectedModels}
                t={t}
                type="image"
                value={defaultImageModel}
                onChange={setDefaultImageModel}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('markup')}</Label>
            <Input
              type="number"
              step="0.1"
              value={markupMultiplier}
              onChange={(event) =>
                setMarkupMultiplier(Number(event.target.value))
              }
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>{t('allowed_models')}</Label>
              <div className="flex items-center gap-2">
                {selectedModels.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedModels([])}
                  >
                    {t('clear_all')}
                  </Button>
                )}
                <Badge variant="outline">
                  {selectedModels.length === 0
                    ? t('all_models')
                    : `${selectedModels.length} ${t('selected')}`}
                </Badge>
              </div>
            </div>
            <AdminModelAllowlistPicker
              defaultImageModel={defaultImageModel}
              defaultLanguageModel={defaultLanguageModel}
              selectedModels={selectedModels}
              setSelectedModels={setSelectedModels}
              t={t}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isPending || !canSave}>
              {t('save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
