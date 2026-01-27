'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Edit,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Trash2,
} from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types';
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
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useWorkspaceCategories } from '@/hooks/use-workspace-categories';
import { CopyFromWorkspaceDialog } from './copy-from-workspace-dialog';

interface TimeTrackerCategoriesSettingsProps {
  wsId: string;
}

const CATEGORY_COLORS = [
  { value: 'BLUE', label: 'Blue', class: 'bg-blue-500' },
  { value: 'GREEN', label: 'Green', class: 'bg-green-500' },
  { value: 'RED', label: 'Red', class: 'bg-red-500' },
  { value: 'YELLOW', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'ORANGE', label: 'Orange', class: 'bg-orange-500' },
  { value: 'PURPLE', label: 'Purple', class: 'bg-purple-500' },
  { value: 'PINK', label: 'Pink', class: 'bg-pink-500' },
  { value: 'INDIGO', label: 'Indigo', class: 'bg-indigo-500' },
  { value: 'CYAN', label: 'Cyan', class: 'bg-cyan-500' },
  { value: 'GRAY', label: 'Gray', class: 'bg-gray-500' },
];

export function TimeTrackerCategoriesSettings({
  wsId,
}: TimeTrackerCategoriesSettingsProps) {
  const t = useTranslations('settings.time_tracker.categories_management');
  const queryClient = useQueryClient();
  const { data: categories, isLoading: isLoadingCategories } =
    useWorkspaceCategories({ wsId });

  const categoryNameId = useId();
  const categoryDescriptionId = useId();
  const editCategoryNameId = useId();
  const editCategoryDescriptionId = useId();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] =
    useState<TimeTrackingCategory | null>(null);
  const [categoryToEdit, setCategoryToEdit] =
    useState<TimeTrackingCategory | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('BLUE');

  const resetForm = () => {
    setName('');
    setDescription('');
    setColor('BLUE');
  };

  const openAddDialog = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (category: TimeTrackingCategory) => {
    setCategoryToEdit(category);
    setName(category.name);
    setDescription(category.description || '');
    setColor(category.color || 'BLUE');
    setIsEditDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/categories`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            color,
          }),
        }
      );
      if (!response.ok) throw new Error(t('create_error'));
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-categories', wsId],
      });
      setIsAddDialogOpen(false);
      resetForm();
      toast.success(t('create_success'));
    },
    onError: (error) => {
      console.error('Error creating category:', error);
      toast.error(t('create_error'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!categoryToEdit) return;
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/categories/${categoryToEdit.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            color,
          }),
        }
      );
      if (!response.ok) throw new Error(t('update_error'));
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-categories', wsId],
      });
      setIsEditDialogOpen(false);
      setCategoryToEdit(null);
      resetForm();
      toast.success(t('update_success'));
    },
    onError: (error) => {
      console.error('Error updating category:', error);
      toast.error(t('update_error'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!categoryToDelete) return;
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/categories/${categoryToDelete.id}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) throw new Error(t('delete_error'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-categories', wsId],
      });
      setCategoryToDelete(null);
      toast.success(t('delete_success'));
    },
    onError: (error) => {
      console.error('Error deleting category:', error);
      toast.error(t('delete_error'));
    },
  });

  const getCategoryColor = (color: string) => {
    const colorConfig = CATEGORY_COLORS.find((c) => c.value === color);
    return colorConfig?.class || 'bg-blue-500';
  };

  if (isLoadingCategories) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 shrink-0" />
            <h3 className="font-medium text-lg">{t('title')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setIsCopyDialogOpen(true)}
              className="shrink-0"
            >
              <Copy className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">
                {t('copy_from_workspace')}
              </span>
              <span className="sm:hidden">{t('copy_short')}</span>
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAddDialog} className="shrink-0">
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{t('add_category')}</span>
                  <span className="sm:hidden">{t('add_short')}</span>
                </Button>
              </DialogTrigger>
            </Dialog>
          </div>
        </div>

        {categories?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <LayoutGrid className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg text-muted-foreground">
                {t('no_categories')}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('no_categories_description')}
              </p>
              <Button
                onClick={openAddDialog}
                variant="outline"
                className="mt-4"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('create_first')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {categories?.map((category) => (
              <Card key={category.id} className="group relative">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className={cn(
                          'h-6 w-6 shrink-0 rounded-full',
                          getCategoryColor(category.color || 'BLUE')
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-medium">
                          {category.name}
                        </h3>
                        {category.description && (
                          <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                            {category.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openEditDialog(category)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          {t('edit')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setCategoryToDelete(category)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Category Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t('create_title')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor={categoryNameId}>{t('name')}</Label>
              <Input
                id={categoryNameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('name_placeholder')}
              />
            </div>
            <div>
              <Label htmlFor={categoryDescriptionId}>{t('description')}</Label>
              <Textarea
                id={categoryDescriptionId}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('description_placeholder')}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="category-color">{t('color')}</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_COLORS.map((colorOption) => (
                    <SelectItem
                      key={colorOption.value}
                      value={colorOption.value}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-4 w-4 rounded-full',
                            colorOption.class
                          )}
                        />
                        {t(`colors.${colorOption.value.toLowerCase()}` as any)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                className="flex-1"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  if (!name.trim()) {
                    toast.error(t('enter_name_error'));
                    return;
                  }
                  createMutation.mutate();
                }}
                disabled={createMutation.isPending || !name.trim()}
                className="flex-1"
              >
                {createMutation.isPending ? t('creating') : t('create_button')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              {t('edit')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor={editCategoryNameId}>{t('name')}</Label>
              <Input
                id={editCategoryNameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('name_placeholder')}
              />
            </div>
            <div>
              <Label htmlFor={editCategoryDescriptionId}>
                {t('description')}
              </Label>
              <Textarea
                id={editCategoryDescriptionId}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('description_placeholder')}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-category-color">{t('color')}</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_COLORS.map((colorOption) => (
                    <SelectItem
                      key={colorOption.value}
                      value={colorOption.value}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-4 w-4 rounded-full',
                            colorOption.class
                          )}
                        />
                        {t(`colors.${colorOption.value.toLowerCase()}` as any)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                className="flex-1"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  if (!name.trim()) {
                    toast.error(t('enter_name_error'));
                    return;
                  }
                  updateMutation.mutate();
                }}
                disabled={updateMutation.isPending || !name.trim()}
                className="flex-1"
              >
                {updateMutation.isPending ? t('updating') : t('update_button')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!categoryToDelete}
        onOpenChange={() => setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_confirm_description', {
                name: categoryToDelete?.name || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t('deleting') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy from Workspace Dialog */}
      <CopyFromWorkspaceDialog
        wsId={wsId}
        open={isCopyDialogOpen}
        onOpenChange={setIsCopyDialogOpen}
      />
    </>
  );
}
