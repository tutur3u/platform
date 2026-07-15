'use client';

import { BarChart3, Calculator, CheckSquare, Target } from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import type {
  EstimationOption,
  UpdateTaskEstimateBoardInput,
} from './use-task-estimates';

interface EditEstimationDialogProps {
  board: Partial<WorkspaceTaskBoard> | null;
  open: boolean;
  isPending: boolean;
  estimationTypes: EstimationOption[];
  getRangeInfo: (type: string) => {
    label: string;
    standard: {
      label: string;
      description: string;
    };
    extended: {
      label: string;
      description: string;
    };
  } | null;
  getEstimationDescription: (
    estimationTypes: EstimationOption[],
    type: WorkspaceTaskBoard['estimation_type'] | null,
    isExtended?: boolean
  ) => string;
  onClose: () => void;
  onUpdate: (input: UpdateTaskEstimateBoardInput) => Promise<void>;
}

export function EditEstimationDialog({
  board,
  open,
  isPending,
  estimationTypes,
  getRangeInfo,
  getEstimationDescription,
  onClose,
  onUpdate,
}: EditEstimationDialogProps) {
  const t = useTranslations('task-estimates');
  const tBoardGallery = useTranslations('ws-board-templates.gallery');
  const [selectedEstimationType, setSelectedEstimationType] =
    useState<string>('none');
  const [extendedEstimation, setExtendedEstimation] = useState(false);
  const [allowZeroEstimates, setAllowZeroEstimates] = useState(true);
  const [countUnestimatedIssues, setCountUnestimatedIssues] = useState(false);
  const rangeGroupId = useId();
  const allowZeroEstimatesLabelId = useId();
  const countUnestimatedIssuesLabelId = useId();

  useEffect(() => {
    if (!board || !open) {
      setSelectedEstimationType('none');
      setExtendedEstimation(false);
      setAllowZeroEstimates(true);
      setCountUnestimatedIssues(false);
      return;
    }

    setSelectedEstimationType(board.estimation_type ?? 'none');
    setExtendedEstimation(board.extended_estimation ?? false);
    setAllowZeroEstimates(board.allow_zero_estimates ?? false);
    setCountUnestimatedIssues(board.count_unestimated_issues ?? false);
  }, [board, open]);

  if (!board) {
    return null;
  }

  const boardName = board.name?.trim()
    ? board.name
    : tBoardGallery('unnamed_board');
  const rangeInfo = getRangeInfo(selectedEstimationType);
  const isStandardSelected = !extendedEstimation;
  const selectedEstimationOption =
    estimationTypes.find((type) => type.value === selectedEstimationType) ??
    estimationTypes[0];

  const handleUpdateEstimationType = async () => {
    if (!board.id) {
      return;
    }

    await onUpdate({
      boardId: board.id,
      estimationType:
        selectedEstimationType === 'none' ? null : selectedEstimationType,
      extendedEstimation,
      allowZeroEstimates,
      countUnestimatedIssues,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-135">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
              <Target className="h-4 w-4 text-dynamic-orange" />
            </div>
            <span>{t('dialog.title', { name: boardName })}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
            <Label
              htmlFor="estimation-method"
              className="flex items-center gap-2 font-semibold text-foreground text-sm"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                <Calculator className="h-3.5 w-3.5 text-dynamic-orange" />
              </div>
              {t('dialog.estimation_method')}
            </Label>
            <Select
              value={selectedEstimationType}
              onValueChange={setSelectedEstimationType}
            >
              <SelectTrigger
                id="estimation-method"
                className="flex h-full w-full items-center justify-between text-left text-sm transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 [&>svg]:rotate-180 data-[state=open]:[&>svg]:rotate-0"
              >
                {selectedEstimationOption ? (
                  <div className="py-1">
                    <div className="font-medium">
                      {selectedEstimationOption.label}
                    </div>
                    <div className="mt-1 text-muted-foreground text-sm">
                      {selectedEstimationOption.description}
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    {t('dialog.select_estimation_method')}
                  </span>
                )}
              </SelectTrigger>
              <SelectContent
                align="end"
                className="w-(--radix-select-trigger-width)"
              >
                {estimationTypes.map((type) => (
                  <SelectItem
                    key={type.value}
                    value={type.value}
                    className="cursor-pointer"
                  >
                    <div className="py-2">
                      <div className="font-medium">{type.label}</div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {type.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedEstimationType !== 'none' && rangeInfo && (
            <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
              <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                  <BarChart3 className="h-3.5 w-3.5 text-dynamic-orange" />
                </div>
                {rangeInfo.label}
              </Label>
              <RadioGroup
                value={extendedEstimation ? 'extended' : 'standard'}
                onValueChange={(value) =>
                  setExtendedEstimation(value === 'extended')
                }
                className="grid gap-3"
              >
                <div>
                  <RadioGroupItem
                    value="standard"
                    id={`${rangeGroupId}-standard`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`${rangeGroupId}-standard`}
                    className="flex cursor-pointer items-center justify-between rounded-lg border-2 p-4 text-left transition-colors peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                  >
                    <div className="space-y-1">
                      <div className="font-medium">
                        {rangeInfo.standard.label}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {rangeInfo.standard.description}
                      </div>
                    </div>
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                        isStandardSelected
                          ? 'border-primary bg-primary'
                          : 'border-border bg-background'
                      }`}
                    >
                      {isStandardSelected && (
                        <div className="h-full w-full scale-50 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                  </Label>
                </div>

                <div>
                  <RadioGroupItem
                    value="extended"
                    id={`${rangeGroupId}-extended`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`${rangeGroupId}-extended`}
                    className="flex cursor-pointer items-center justify-between rounded-lg border-2 p-4 text-left transition-colors peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                  >
                    <div className="space-y-1">
                      <div className="font-medium">
                        {rangeInfo.extended.label}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {rangeInfo.extended.description}
                      </div>
                    </div>
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                        extendedEstimation
                          ? 'border-primary bg-primary'
                          : 'border-border bg-background'
                      }`}
                    >
                      {extendedEstimation && (
                        <div className="h-full w-full scale-50 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {selectedEstimationType !== 'none' && (
            <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
              <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                  <CheckSquare className="h-3.5 w-3.5 text-dynamic-orange" />
                </div>
                {t('dialog.estimation_options')}
              </Label>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background p-3.5 transition-all hover:border-primary/30">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div
                    id={allowZeroEstimatesLabelId}
                    className="font-medium text-sm"
                  >
                    {t('dialog.allow_zero_estimates')}
                  </div>
                  <div className="text-muted-foreground text-xs leading-snug">
                    {t('dialog.allow_zero_estimates_description')}
                  </div>
                </div>
                <Switch
                  checked={allowZeroEstimates}
                  onCheckedChange={setAllowZeroEstimates}
                  aria-labelledby={allowZeroEstimatesLabelId}
                  className="shrink-0"
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background p-3.5 transition-all hover:border-primary/30">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div
                    id={countUnestimatedIssuesLabelId}
                    className="font-medium text-sm"
                  >
                    {t('dialog.count_unestimated_issues')}
                  </div>
                  <div className="text-muted-foreground text-xs leading-snug">
                    {t('dialog.count_unestimated_issues_description')}
                  </div>
                </div>
                <Switch
                  checked={countUnestimatedIssues}
                  onCheckedChange={setCountUnestimatedIssues}
                  aria-labelledby={countUnestimatedIssuesLabelId}
                  className="shrink-0"
                />
              </div>
            </div>
          )}

          {selectedEstimationType !== 'none' && (
            <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-3.5 ring-1 ring-dynamic-orange/10">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-dynamic-orange">
                  <div className="h-2 w-2 rounded-full bg-background" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold text-dynamic-orange text-sm">
                    {t('dialog.selected_configuration')}
                  </p>
                  <p className="text-muted-foreground text-xs leading-snug">
                    {getEstimationDescription(
                      estimationTypes,
                      selectedEstimationType === 'none'
                        ? null
                        : (selectedEstimationType as WorkspaceTaskBoard['estimation_type']),
                      extendedEstimation
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className="sm:w-auto"
            >
              {t('dialog.cancel')}
            </Button>
            <Button
              onClick={handleUpdateEstimationType}
              disabled={
                isPending ||
                (!board.estimation_type && selectedEstimationType === 'none')
              }
            >
              {isPending ? (
                <>
                  <Calculator className="mr-2 h-4 w-4 animate-spin" />
                  {t('dialog.updating')}
                </>
              ) : (
                <>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  {t('dialog.update_estimation')}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
