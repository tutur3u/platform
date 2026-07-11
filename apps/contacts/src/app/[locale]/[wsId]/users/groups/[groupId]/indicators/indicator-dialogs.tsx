import type { UseMutationResult } from '@tanstack/react-query';
import { Trash2 } from '@tuturuuu/icons';
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
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import type {
  GroupIndicator,
  MetricCategory,
} from '@tuturuuu/users-core/lib/group-indicators-types';
import { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

interface IndicatorForm {
  categoryIds: string[];
  factor: number;
  isWeighted: boolean;
  name: string;
  unit: string;
}

const defaultIndicatorForm: IndicatorForm = {
  categoryIds: [],
  factor: 1,
  isWeighted: true,
  name: '',
  unit: '',
};

function toggleCategory(categoryIds: string[], categoryId: string) {
  return categoryIds.includes(categoryId)
    ? categoryIds.filter((id) => id !== categoryId)
    : [...categoryIds, categoryId];
}

function MetricCategoryFields({
  form,
  metricCategories,
  setForm,
}: {
  form: IndicatorForm;
  metricCategories: MetricCategory[];
  setForm: Dispatch<SetStateAction<IndicatorForm>>;
}) {
  const tIndicators = useTranslations('ws-user-group-indicators');

  return (
    <div className="space-y-2">
      <Label>{tIndicators('metric_categories')}</Label>
      {metricCategories.length ? (
        <div className="grid gap-2 rounded-md border p-3">
          {metricCategories.map((category) => (
            <label
              key={category.id}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                checked={form.categoryIds.includes(category.id)}
                onCheckedChange={() =>
                  setForm((prev) => ({
                    ...prev,
                    categoryIds: toggleCategory(prev.categoryIds, category.id),
                  }))
                }
              />
              <span>{category.name}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {tIndicators('no_metric_categories')}
        </p>
      )}
    </div>
  );
}

function WeightedMetricField({
  form,
  setForm,
}: {
  form: IndicatorForm;
  setForm: Dispatch<SetStateAction<IndicatorForm>>;
}) {
  const tIndicators = useTranslations('ws-user-group-indicators');

  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
      <Checkbox
        checked={form.isWeighted}
        onCheckedChange={(checked) =>
          setForm((prev) => ({ ...prev, isWeighted: checked === true }))
        }
      />
      <span className="space-y-1">
        <span className="block font-medium text-sm">
          {tIndicators('counts_toward_average')}
        </span>
        <span className="block text-muted-foreground text-sm">
          {tIndicators('counts_toward_average_description')}
        </span>
      </span>
    </label>
  );
}

export function AddIndicatorDialog({
  open,
  onOpenChange,
  createMutation,
  metricCategories,
  isAnyMutationPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createMutation: UseMutationResult<unknown, Error, IndicatorForm>;
  metricCategories: MetricCategory[];
  isAnyMutationPending: boolean;
}) {
  const t = useTranslations();
  const tIndicators = useTranslations('ws-user-group-indicators');
  const [form, setForm] = useState<IndicatorForm>(defaultIndicatorForm);

  const resetForm = () => setForm(defaultIndicatorForm);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createMutation.mutateAsync({
      ...form,
      name: form.name.trim(),
      unit: form.unit.trim(),
    });
    onOpenChange(false);
    resetForm();
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tIndicators('add_indicator')}</DialogTitle>
          <DialogDescription>
            {tIndicators('add_indicator_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-metric-name">
              {tIndicators('indicator_name')}
            </Label>
            <Input
              id="new-metric-name"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={tIndicators('indicator_name_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-metric-unit">{tIndicators('unit')}</Label>
            <Input
              id="new-metric-unit"
              value={form.unit}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, unit: e.target.value }))
              }
              placeholder={tIndicators('unit_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-metric-factor">{tIndicators('factor')}</Label>
            <Input
              id="new-metric-factor"
              type="number"
              step="0.01"
              value={form.factor}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  factor: parseFloat(e.target.value) || 1,
                }))
              }
              placeholder={tIndicators('factor_placeholder')}
            />
            <p className="text-muted-foreground text-sm">
              {tIndicators('factor_description')}
            </p>
          </div>
          <MetricCategoryFields
            form={form}
            metricCategories={metricCategories}
            setForm={setForm}
          />
          <WeightedMetricField form={form} setForm={setForm} />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isAnyMutationPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isAnyMutationPending || !form.name.trim()}
          >
            {createMutation.isPending
              ? tIndicators('adding')
              : tIndicators('add_indicator')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditIndicatorDialog({
  open,
  onOpenChange,
  indicator,
  updateMutation,
  deleteMutation,
  metricCategories,
  canDelete,
  isAnyMutationPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicator: GroupIndicator | null;
  updateMutation: UseMutationResult<
    void,
    Error,
    IndicatorForm & { indicatorId: string }
  >;
  deleteMutation: UseMutationResult<void, Error, string>;
  metricCategories: MetricCategory[];
  canDelete: boolean;
  isAnyMutationPending: boolean;
}) {
  const t = useTranslations();
  const tIndicators = useTranslations('ws-user-group-indicators');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState<IndicatorForm>(defaultIndicatorForm);

  useEffect(() => {
    if (indicator) {
      setForm({
        categoryIds: indicator.categories.map((category) => category.id),
        factor: indicator.factor,
        isWeighted: indicator.is_weighted,
        name: indicator.name,
        unit: indicator.unit,
      });
    }
  }, [indicator]);

  const handleUpdate = async () => {
    if (!indicator) return;
    await updateMutation.mutateAsync({
      ...form,
      indicatorId: indicator.id,
      name: form.name.trim(),
      unit: form.unit.trim(),
    });
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!indicator) return;
    await deleteMutation.mutateAsync(indicator.id);
    setDeleteDialogOpen(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tIndicators('edit_indicator')}</DialogTitle>
          <DialogDescription>
            {tIndicators('edit_indicator_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="metric-name">{tIndicators('indicator_name')}</Label>
            <Input
              id="metric-name"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={tIndicators('indicator_name_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metric-factor">{tIndicators('factor')}</Label>
            <Input
              id="metric-factor"
              type="number"
              step="0.01"
              value={form.factor}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  factor: parseFloat(e.target.value) || 1,
                }))
              }
              placeholder={tIndicators('factor_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metric-unit">{tIndicators('unit')}</Label>
            <Input
              id="metric-unit"
              value={form.unit}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, unit: e.target.value }))
              }
              placeholder={tIndicators('unit_placeholder')}
            />
          </div>
          <MetricCategoryFields
            form={form}
            metricCategories={metricCategories}
            setForm={setForm}
          />
          <WeightedMetricField form={form} setForm={setForm} />
        </div>
        <DialogFooter className="flex justify-between">
          {canDelete && (
            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
            >
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isAnyMutationPending}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common.delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {tIndicators('remove_indicator')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {tIndicators('remove_indicator_description', {
                      indicatorName: indicator?.name || '',
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isAnyMutationPending}>
                    {t('common.cancel')}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isAnyMutationPending}
                    className="bg-dynamic-red/60 hover:bg-dynamic-red/70"
                  >
                    {deleteMutation.isPending
                      ? tIndicators('removing')
                      : t('common.remove')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isAnyMutationPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={isAnyMutationPending || !form.name.trim()}
            >
              {updateMutation.isPending
                ? tIndicators('updating')
                : t('common.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddCategoryDialog({
  open,
  onOpenChange,
  createMutation,
  isAnyMutationPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createMutation: UseMutationResult<
    unknown,
    Error,
    { description: string; name: string }
  >;
  isAnyMutationPending: boolean;
}) {
  const t = useTranslations();
  const tIndicators = useTranslations('ws-user-group-indicators');
  const [form, setForm] = useState({ description: '', name: '' });

  const resetForm = () => setForm({ description: '', name: '' });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createMutation.mutateAsync({
      description: form.description.trim(),
      name: form.name.trim(),
    });
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tIndicators('add_metric_category')}</DialogTitle>
          <DialogDescription>
            {tIndicators('add_metric_category_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="metric-category-name">
              {tIndicators('metric_category_name')}
            </Label>
            <Input
              id="metric-category-name"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={tIndicators('metric_category_name_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metric-category-description">
              {tIndicators('metric_category_description')}
            </Label>
            <Input
              id="metric-category-description"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder={tIndicators(
                'metric_category_description_placeholder'
              )}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
            disabled={isAnyMutationPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isAnyMutationPending || !form.name.trim()}
          >
            {createMutation.isPending
              ? tIndicators('adding')
              : tIndicators('add_metric_category')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
