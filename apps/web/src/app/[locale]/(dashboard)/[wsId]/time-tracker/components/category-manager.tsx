'use client';

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
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { CopyFromWorkspaceDialog } from './copy-from-workspace-dialog';

interface CategoryManagerProps {
  wsId: string;
  categories: TimeTrackingCategory[] | null;
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

export function CategoryManager({ wsId, categories }: CategoryManagerProps) {
  const router = useRouter();
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
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const createCategory = async () => {
    if (!name.trim()) {
      toast.error('Please enter a category name');
      return;
    }

    setIsLoading(true);

    try {
      await fetch(`/api/v1/workspaces/${wsId}/time-tracking/categories`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
        }),
      });

      setIsAddDialogOpen(false);
      resetForm();
      router.refresh();
      toast.success('Category created successfully');
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Failed to create category');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCategory = async () => {
    if (!categoryToEdit || !name.trim()) {
      toast.error('Please enter a category name');
      return;
    }

    setIsLoading(true);

    try {
      await fetch(
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

      setIsEditDialogOpen(false);
      setCategoryToEdit(null);
      resetForm();
      router.refresh();
      toast.success('Category updated successfully');
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Failed to update category');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCategory = async () => {
    if (!categoryToDelete) return;

    setIsDeleting(true);

    try {
      await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/categories/${categoryToDelete.id}`,
        {
          method: 'DELETE',
        }
      );

      setCategoryToDelete(null);
      router.refresh();
      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  const getCategoryColor = (color: string) => {
    const colorConfig = CATEGORY_COLORS.find((c) => c.value === color);
    return colorConfig?.class || 'bg-blue-500';
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 flex-shrink-0" />
              <span>Category Management</span>
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCopyDialogOpen(true)}
                className="flex-shrink-0"
              >
                <Copy className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Copy from Workspace</span>
                <span className="sm:hidden">Copy</span>
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openAddDialog} className="flex-shrink-0">
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Add Category</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {categories?.length === 0 ? (
            <div className="py-12 text-center">
              <LayoutGrid className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg text-muted-foreground">
                No categories created yet
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Create categories to organize your time tracking sessions
              </p>
              <Button
                onClick={openAddDialog}
                variant="outline"
                className="mt-4"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create First Category
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {categories?.map((category) => (
                <Card key={category.id} className="group relative">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div
                          className={cn(
                            'h-6 w-6 flex-shrink-0 rounded-full',
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
                            Edit Category
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setCategoryToDelete(category)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Category
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Category Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Category
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor={categoryNameId}>Name</Label>
              <Input
                id={categoryNameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter category name"
              />
            </div>
            <div>
              <Label htmlFor={categoryDescriptionId}>
                Description (optional)
              </Label>
              <Textarea
                id={categoryDescriptionId}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter category description"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="category-color">Color</Label>
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
                        {colorOption.label}
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
                Cancel
              </Button>
              <Button
                onClick={createCategory}
                disabled={isLoading || !name.trim()}
                className="flex-1"
              >
                {isLoading ? 'Creating...' : 'Create Category'}
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
              Edit Category
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor={editCategoryNameId}>Name</Label>
              <Input
                id={editCategoryNameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter category name"
              />
            </div>
            <div>
              <Label htmlFor={editCategoryDescriptionId}>
                Description (optional)
              </Label>
              <Textarea
                id={editCategoryDescriptionId}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter category description"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-category-color">Color</Label>
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
                        {colorOption.label}
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
                Cancel
              </Button>
              <Button
                onClick={updateCategory}
                disabled={isLoading || !name.trim()}
                className="flex-1"
              >
                {isLoading ? 'Updating...' : 'Update Category'}
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
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the category "
              {categoryToDelete?.name}"? This action cannot be undone and will
              remove the category from all existing time sessions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteCategory}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Category'}
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
