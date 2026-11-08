'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Plus, Trash2 } from '@tuturuuu/icons';
import {
  createWorkspaceBreakType,
  deleteWorkspaceBreakType,
  listWorkspaceBreakTypes,
  updateWorkspaceBreakType,
  type WorkspaceBreakType,
} from '@tuturuuu/internal-api/time-tracking';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  BREAK_COLOR_CLASSES,
  getBreakTypeColor,
  getIconComponent,
} from '@/hooks/useBreakTypeStyles';

const COLOR_OPTIONS = [
  'RED',
  'ORANGE',
  'YELLOW',
  'GREEN',
  'CYAN',
  'BLUE',
  'INDIGO',
  'PURPLE',
  'PINK',
  'GRAY',
] as const;

const ICON_OPTIONS = [
  'Coffee',
  'Utensils',
  'User',
  'Users',
  'Heart',
  'Moon',
  'Sun',
  'Zap',
  'Book',
  'Briefcase',
  'Home',
  'Dumbbell',
  'Music',
  'Gamepad2',
  'Pause',
  'Wind',
] as const;

interface BreakTypeFormState {
  name: string;
  description: string;
  color: string;
  icon: string;
  is_default: boolean;
}

const initialFormState: BreakTypeFormState = {
  name: '',
  description: '',
  color: 'RED',
  icon: 'Coffee',
  is_default: false,
};

interface WorkspaceBreakTypesSettingsProps {
  wsId: string;
}

export function WorkspaceBreakTypesSettings({
  wsId,
}: WorkspaceBreakTypesSettingsProps) {
  const t = useTranslations('time-tracker.break_types');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formState, setFormState] =
    useState<BreakTypeFormState>(initialFormState);

  // Fetch break types
  const { data: breakTypes, isLoading } = useQuery({
    queryKey: ['workspace-break-types', wsId],
    queryFn: async () => {
      const breakTypes = await listWorkspaceBreakTypes(wsId);
      return [...breakTypes].sort((a, b) => {
        if (a.is_default && !b.is_default) return -1;
        if (!a.is_default && b.is_default) return 1;

        const aCreatedAt = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bCreatedAt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return aCreatedAt - bCreatedAt;
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create break type
  const createMutation = useMutation({
    mutationFn: async (newType: BreakTypeFormState) => {
      return createWorkspaceBreakType(wsId, {
        name: newType.name,
        description: newType.description || null,
        color: newType.color,
        icon: newType.icon,
        isDefault: newType.is_default,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-break-types', wsId],
      });
      setFormState(initialFormState);
      setIsCreateDialogOpen(false);
      toast.success(t('created'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('error_creating'));
    },
  });

  // Update break type
  const updateMutation = useMutation({
    mutationFn: async (updatedType: BreakTypeFormState) => {
      if (!editingId) throw new Error('No break type selected for update');

      return updateWorkspaceBreakType(wsId, editingId, {
        name: updatedType.name,
        description: updatedType.description || null,
        color: updatedType.color,
        icon: updatedType.icon,
        isDefault: updatedType.is_default,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-break-types', wsId],
      });
      setEditingId(null);
      setFormState(initialFormState);
      toast.success(t('updated'));
    },
    onError: (error: Error) => {
      // Invalidate and refetch to revert UI state in case of failure
      queryClient.invalidateQueries({
        queryKey: ['workspace-break-types', wsId],
      });
      toast.error(error.message || t('error_updating'));
    },
  });

  // Delete break type
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceBreakType(wsId, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-break-types', wsId],
      });
      toast.success(t('deleted'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('error_deleting'));
    },
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormState(initialFormState);
    setIsCreateDialogOpen(true);
  };

  const handleOpenEdit = (breakType: WorkspaceBreakType) => {
    setEditingId(breakType.id);
    setFormState({
      name: breakType.name,
      description: breakType.description || '',
      color: breakType.color || 'RED',
      icon: breakType.icon || 'Coffee',
      is_default: breakType.is_default || false,
    });
    setIsCreateDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formState.name.trim()) {
      toast.error(t('name_required'));
      return;
    }

    if (editingId) {
      await updateMutation.mutateAsync(formState);
    } else {
      await createMutation.mutateAsync(formState);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setDeleteId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-muted-foreground text-sm">
            {tCommon('loading')}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SettingsSection
        description={t('description_overview')}
        action={
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button size="sm" onClick={handleOpenCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                {t('create')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? t('edit') : t('create')}</DialogTitle>
                <DialogDescription>
                  {editingId ? t('edit_description') : t('create_description')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('name')}</Label>
                  <Input
                    id="name"
                    value={formState.name}
                    onChange={(e) =>
                      setFormState({ ...formState, name: e.target.value })
                    }
                    placeholder={t('name_placeholder')}
                    maxLength={50}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('description')}</Label>
                  <Textarea
                    id="description"
                    value={formState.description}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        description: e.target.value,
                      })
                    }
                    placeholder={t('description_placeholder')}
                    className="resize-none"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="color">{t('color')}</Label>
                    <Select
                      value={formState.color}
                      onValueChange={(value) =>
                        setFormState({ ...formState, color: value })
                      }
                    >
                      <SelectTrigger id="color">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLOR_OPTIONS.map((color) => {
                          const colorToken = getBreakTypeColor(color);
                          const colorClasses = BREAK_COLOR_CLASSES[colorToken];
                          return (
                            <SelectItem key={color} value={color}>
                              <div className="flex items-center gap-2">
                                <div
                                  className={`h-3 w-3 rounded-full ${colorClasses.badgeBg}`}
                                />
                                {color}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="icon">{t('icon')}</Label>
                    <Select
                      value={formState.icon}
                      onValueChange={(value) =>
                        setFormState({ ...formState, icon: value })
                      }
                    >
                      <SelectTrigger id="icon">
                        <div className="flex items-center gap-2">
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map((icon) => {
                          const IconComponent = getIconComponent(icon);
                          return (
                            <SelectItem key={icon} value={icon}>
                              <div className="flex items-center gap-2">
                                <IconComponent className="h-4 w-4" />
                                {icon}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="is_default"
                    checked={formState.is_default}
                    onCheckedChange={(checked) =>
                      setFormState({
                        ...formState,
                        is_default: checked,
                      })
                    }
                  />
                  <Label
                    htmlFor="is_default"
                    className="cursor-pointer font-normal"
                  >
                    {t('set_as_default')}
                  </Label>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {editingId ? t('update') : t('create')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {breakTypes && breakTypes.length > 0 ? (
          breakTypes.map((breakType) => (
            <SettingsSectionBlock
              className="flex items-center justify-between gap-3 py-3"
              key={breakType.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${BREAK_COLOR_CLASSES[getBreakTypeColor(breakType.color)].badgeBg} ${BREAK_COLOR_CLASSES[getBreakTypeColor(breakType.color)].text}`}
                >
                  {getIconComponent(breakType.icon) &&
                    (() => {
                      const IconComponent = getIconComponent(breakType.icon);
                      return <IconComponent className="h-4 w-4" />;
                    })()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{breakType.name}</p>
                    {breakType.is_default && (
                      <Badge variant="outline">{t('default')}</Badge>
                    )}
                  </div>
                  {breakType.description && (
                    <p className="mt-0.5 text-muted-foreground text-sm">
                      {breakType.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleOpenEdit(breakType)}
                  disabled={
                    deleteMutation.isPending ||
                    createMutation.isPending ||
                    updateMutation.isPending
                  }
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteId(breakType.id)}
                  disabled={
                    deleteMutation.isPending ||
                    createMutation.isPending ||
                    updateMutation.isPending
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </SettingsSectionBlock>
          ))
        ) : (
          <SettingsSectionMessage>
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                {t('no_break_types')}
              </p>
              <p>{t('no_break_types_hint')}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenCreate}
                className="mt-3 text-foreground"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('create')}
              </Button>
            </div>
          </SettingsSectionMessage>
        )}
      </SettingsSection>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirm_delete_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
