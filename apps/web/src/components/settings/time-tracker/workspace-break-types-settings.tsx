'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Icons from '@tuturuuu/icons';
import { Coffee, Edit2, Plus, Trash2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Database } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Switch } from '@tuturuuu/ui/switch';

type WorkspaceBreakType =
  Database['public']['Tables']['workspace_break_types']['Row'];

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
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formState, setFormState] =
    useState<BreakTypeFormState>(initialFormState);

  // Helper function to render icon from icon name
  const renderIcon = (iconName: string | null) => {
    if (!iconName) return null;
    const IconComponent = (Icons as any)[iconName];
    if (!IconComponent) return null;
    return <IconComponent className="h-4 w-4" />;
  };

  // Fetch break types
  const { data: breakTypes, isLoading } = useQuery({
    queryKey: ['workspace-break-types', wsId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_break_types')
        .select('*')
        .eq('ws_id', wsId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as WorkspaceBreakType[];
    },
  });

  // Create break type
  const createMutation = useMutation({
    mutationFn: async (newType: BreakTypeFormState) => {
      const { data, error } = await supabase
        .from('workspace_break_types')
        .insert({
          ws_id: wsId,
          name: newType.name,
          description: newType.description || null,
          color: newType.color,
          icon: newType.icon,
          is_default: newType.is_default,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
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

      // If setting as default, unset others first
      if (updatedType.is_default) {
        await supabase
          .from('workspace_break_types')
          .update({ is_default: false })
          .eq('ws_id', wsId)
          .neq('id', editingId);
      }

      const { data, error } = await supabase
        .from('workspace_break_types')
        .update({
          name: updatedType.name,
          description: updatedType.description || null,
          color: updatedType.color,
          icon: updatedType.icon,
          is_default: updatedType.is_default,
        })
        .eq('id', editingId)
        .select()
        .single();

      if (error) throw error;
      return data;
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
      toast.error(error.message || t('error_updating'));
    },
  });

  // Delete break type
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('workspace_break_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
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
      color: breakType.color || 'AMBER',
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
      <SettingItemTab
        title={t('title')}
        description={t('description_overview')}
      >
        <div className="mt-4 flex flex-col gap-6">
          <div className="flex justify-end">
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
                  <DialogTitle>
                    {editingId ? t('edit') : t('create')}
                  </DialogTitle>
                  <DialogDescription>
                    {editingId
                      ? t('edit_description')
                      : t('create_description')}
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
                          {COLOR_OPTIONS.map((color) => (
                            <SelectItem key={color} value={color}>
                              <div className="flex items-center gap-2">
                                <div
                                  className={`h-3 w-3 rounded-full bg-dynamic-${color.toLowerCase()}`}
                                />
                                {color}
                              </div>
                            </SelectItem>
                          ))}
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
                          {ICON_OPTIONS.map((icon) => (
                            <SelectItem key={icon} value={icon}>
                              <div className="flex items-center gap-2">
                                {renderIcon(icon)}
                                {icon}
                              </div>
                            </SelectItem>
                          ))}
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
          </div>

          <div className="grid gap-4">
            {breakTypes && breakTypes.length > 0 ? (
              <div className="grid gap-3">
                {breakTypes.map((breakType) => (
                  <div
                    key={breakType.id}
                    className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-${breakType.color?.toLowerCase()}/10 text-dynamic-${breakType.color?.toLowerCase()}`}
                      >
                        {renderIcon(breakType.icon) || (
                          <Coffee className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{breakType.name}</h4>
                          {breakType.is_default && (
                            <span className="rounded-full bg-dynamic-blue/10 px-2 py-0.5 font-medium text-dynamic-blue text-xs">
                              {t('default')}
                            </span>
                          )}
                          {breakType.is_system && (
                            <span className="rounded-full bg-dynamic-gray/10 px-2 py-0.5 font-medium text-dynamic-gray text-xs">
                              {t('system')}
                            </span>
                          )}
                        </div>
                        {breakType.description && (
                          <p className="mt-1 text-muted-foreground text-sm">
                            {breakType.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
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
                      {!breakType.is_system && (
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
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border border-dashed p-12 text-center">
                <Coffee className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <h3 className="font-semibold text-lg">{t('no_break_types')}</h3>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t('no_break_types_hint')}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenCreate}
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('create')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </SettingItemTab>

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

      <Separator />
    </div>
  );
}
