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
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { GroupIndicator } from './types';

// --- Add Indicator Dialog ---

interface AddIndicatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createMutation: UseMutationResult<
    unknown,
    Error,
    { name: string; unit: string; factor: number }
  >;
  isAnyMutationPending: boolean;
}

export function AddIndicatorDialog({
  open,
  onOpenChange,
  createMutation,
  isAnyMutationPending,
}: AddIndicatorDialogProps) {
  const t = useTranslations();
  const tIndicators = useTranslations('ws-user-group-indicators');
  const [form, setForm] = useState({ name: '', unit: '', factor: 1 });

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await createMutation.mutateAsync({
      name: form.name.trim(),
      unit: form.unit.trim(),
      factor: form.factor,
    });
    onOpenChange(false);
    setForm({ name: '', unit: '', factor: 1 });
  };

  const handleClose = () => {
    onOpenChange(false);
    setForm({ name: '', unit: '', factor: 1 });
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
            <Label htmlFor="new-vital-name">
              {tIndicators('indicator_name')}
            </Label>
            <Input
              id="new-vital-name"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={tIndicators('indicator_name_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-vital-unit">{tIndicators('unit')}</Label>
            <Input
              id="new-vital-unit"
              value={form.unit}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, unit: e.target.value }))
              }
              placeholder={tIndicators('unit_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-vital-factor">{tIndicators('factor')}</Label>
            <Input
              id="new-vital-factor"
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

// --- Edit Indicator Dialog (with embedded Delete) ---

interface EditIndicatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicator: GroupIndicator | null;
  updateMutation: UseMutationResult<
    void,
    Error,
    { indicatorId: string; name: string; factor: number; unit: string }
  >;
  deleteMutation: UseMutationResult<void, Error, string>;
  canDelete: boolean;
  isAnyMutationPending: boolean;
}

export function EditIndicatorDialog({
  open,
  onOpenChange,
  indicator,
  updateMutation,
  deleteMutation,
  canDelete,
  isAnyMutationPending,
}: EditIndicatorDialogProps) {
  const t = useTranslations();
  const tIndicators = useTranslations('ws-user-group-indicators');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: indicator?.name || '',
    factor: indicator?.factor || 1,
    unit: indicator?.unit || '',
  });

  // Sync form when indicator changes
  useEffect(() => {
    if (indicator) {
      setForm({
        name: indicator.name,
        factor: indicator.factor,
        unit: indicator.unit,
      });
    }
  }, [indicator]);

  const handleUpdate = async () => {
    if (!indicator) return;
    await updateMutation.mutateAsync({
      indicatorId: indicator.id,
      name: form.name,
      factor: form.factor,
      unit: form.unit,
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tIndicators('edit_indicator')}</DialogTitle>
          <DialogDescription>
            {tIndicators('edit_indicator_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="indicator-name">
              {tIndicators('indicator_name')}
            </Label>
            <Input
              id="indicator-name"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={tIndicators('indicator_name_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="indicator-factor">{tIndicators('factor')}</Label>
            <Input
              id="indicator-factor"
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
            <Label htmlFor="indicator-unit">{tIndicators('unit')}</Label>
            <Input
              id="indicator-unit"
              value={form.unit}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, unit: e.target.value }))
              }
              placeholder={tIndicators('unit_placeholder')}
            />
          </div>
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
