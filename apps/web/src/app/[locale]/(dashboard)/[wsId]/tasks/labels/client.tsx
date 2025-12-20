'use client';

import {
  Check,
  Edit2,
  MoreVertical,
  Palette,
  Plus,
  Search,
  Tag,
  Trash2,
} from '@tuturuuu/icons';
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
import { Card } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { toast } from '@tuturuuu/ui/sonner';
import { computeAccessibleLabelStyles } from '@tuturuuu/ui/tu-do/utils/label-colors';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useMemo, useState } from 'react';

interface TaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
  creator_id: string | null;
}

interface Props {
  wsId: string;
  initialLabels: TaskLabel[];
}

const colorPresets = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#6B7280', // gray
  '#000000', // black
];

export default function TaskLabelsClient({ wsId, initialLabels }: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [labels, setLabels] = useState<TaskLabel[]>(initialLabels);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<TaskLabel | null>(null);
  const [deletingLabel, setDeletingLabel] = useState<TaskLabel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    color: colorPresets[0],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredLabels = useMemo(() => {
    if (!searchQuery.trim()) return labels;
    const query = searchQuery.toLowerCase();
    return labels.filter((label) => label.name.toLowerCase().includes(query));
  }, [labels, searchQuery]);

  const resetForm = () => {
    setFormData({
      name: '',
      color: colorPresets[0],
    });
    setEditingLabel(null);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a label name');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${wsId}/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          color: formData.color,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create label');
      }

      const newLabel = await response.json();
      setLabels((prev) => [newLabel, ...prev]);
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success('Label created successfully');
      router.refresh();
    } catch (error) {
      console.error('Error creating label:', error);
      toast.error('Failed to create label');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editingLabel || !formData.name.trim()) {
      toast.error('Please enter a label name');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/labels/${editingLabel.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: formData.name.trim(),
            color: formData.color,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update label');
      }

      const updatedLabel = await response.json();
      setLabels((prev) =>
        prev.map((label) =>
          label.id === editingLabel.id ? updatedLabel : label
        )
      );
      resetForm();
      toast.success('Label updated successfully');
      router.refresh();
    } catch (error) {
      console.error('Error updating label:', error);
      toast.error('Failed to update label');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingLabel) return;

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/labels/${deletingLabel.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete label');
      }

      setLabels((prev) =>
        prev.filter((label) => label.id !== deletingLabel.id)
      );
      toast.success('Label deleted successfully');
      setDeletingLabel(null);
      router.refresh();
    } catch (error) {
      console.error('Error deleting label:', error);
      toast.error('Failed to delete label');
    }
  };

  const openEditDialog = (label: TaskLabel) => {
    setEditingLabel(label);
    setFormData({
      name: label.name,
      color: label.color,
    });
  };

  const closeDialog = () => {
    setIsCreateDialogOpen(false);
    resetForm();
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Tag className="h-4 w-4" />
            <span>
              {labels.length} label{labels.length !== 1 ? 's' : ''}
            </span>
          </div>
          {labels.length > 0 && (
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search labels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Label
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Label</DialogTitle>
              <DialogDescription>
                Create a new label to organize and categorize your tasks
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Label Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Bug, Feature, Priority"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && formData.name.trim()) {
                      handleCreate();
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="space-y-3">
                <Label>Color</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {colorPresets.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        'h-8 w-8 rounded-md border-2 transition-all hover:scale-110',
                        formData.color === color
                          ? 'border-foreground ring-2 ring-foreground/20 ring-offset-2'
                          : 'border-border hover:border-foreground/50'
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, color }))
                      }
                      aria-label={`Select color ${color}`}
                    >
                      {formData.color === color && (
                        <Check className="m-auto h-4 w-4 text-white" />
                      )}
                    </button>
                  ))}
                  <div className="relative">
                    <Input
                      type="color"
                      value={formData.color}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          color: e.target.value,
                        }))
                      }
                      className="h-8 w-8 cursor-pointer rounded-md border-2 p-1"
                      title="Custom color picker"
                    />
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="mb-2 text-muted-foreground text-xs">Preview</p>
                  <Badge
                    variant="outline"
                    style={(() => {
                      const styles = computeAccessibleLabelStyles(
                        formData.color || '#EF4444',
                        !!isDark
                      );
                      return styles
                        ? {
                            backgroundColor: styles.bg,
                            borderColor: styles.border,
                            color: styles.text,
                          }
                        : undefined;
                    })()}
                    className="font-medium"
                  >
                    {formData.name || 'Label Preview'}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleCreate}
                  disabled={isSubmitting || !formData.name.trim()}
                  className="flex-1"
                >
                  {isSubmitting ? 'Creating...' : 'Create Label'}
                </Button>
                <Button
                  variant="outline"
                  onClick={closeDialog}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Labels Grid */}
      {labels.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-muted p-6">
              <Tag className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-xl">No labels yet</h3>
              <p className="max-w-sm text-muted-foreground">
                Create your first label to start organizing and categorizing
                your tasks efficiently
              </p>
            </div>
            <Button
              onClick={() => setIsCreateDialogOpen(true)}
              size="lg"
              className="mt-2"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Label
            </Button>
          </div>
        </Card>
      ) : filteredLabels.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-muted p-6">
              <Search className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-xl">No labels found</h3>
              <p className="text-muted-foreground">
                No labels match your search query &ldquo;{searchQuery}&rdquo;
              </p>
            </div>
            <Button variant="outline" onClick={() => setSearchQuery('')}>
              Clear Search
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {filteredLabels.map((label) => (
            <Card
              key={label.id}
              className="group relative cursor-pointer overflow-hidden transition-all hover:scale-[1.02] hover:shadow-md"
              onClick={() => openEditDialog(label)}
            >
              <div className="p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    style={(() => {
                      const styles = computeAccessibleLabelStyles(
                        label.color,
                        !!isDark
                      );
                      return styles
                        ? {
                            backgroundColor: styles.bg,
                            borderColor: styles.border,
                            color: styles.text,
                          }
                        : undefined;
                    })()}
                    className="font-semibold text-sm"
                  >
                    {label.name}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(label);
                        }}
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingLabel(label);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Palette className="h-3 w-3 shrink-0" />
                  <span className="truncate font-mono">
                    {label.color.toUpperCase()}
                  </span>
                </div>
              </div>
              <div
                className="absolute bottom-0 left-0 h-1 w-full transition-all group-hover:h-1.5"
                style={{ backgroundColor: label.color }}
              />
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      {editingLabel && (
        <Dialog open={!!editingLabel} onOpenChange={() => resetForm()}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Label</DialogTitle>
              <DialogDescription>
                Update the label name and color
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Label Name</Label>
                <Input
                  id="edit-name"
                  placeholder="e.g., Bug, Feature, Priority"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && formData.name.trim()) {
                      handleEdit();
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="space-y-3">
                <Label>Color</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {colorPresets.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        'h-8 w-8 rounded-md border-2 transition-all hover:scale-110',
                        formData.color === color
                          ? 'border-foreground ring-2 ring-foreground/20 ring-offset-2'
                          : 'border-border hover:border-foreground/50'
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, color }))
                      }
                      aria-label={`Select color ${color}`}
                    >
                      {formData.color === color && (
                        <Check className="m-auto h-4 w-4 text-white" />
                      )}
                    </button>
                  ))}
                  <div className="relative">
                    <Input
                      type="color"
                      value={formData.color}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          color: e.target.value,
                        }))
                      }
                      className="h-8 w-8 cursor-pointer rounded-md border-2 p-1"
                      title="Custom color picker"
                    />
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="mb-2 text-muted-foreground text-xs">Preview</p>
                  <Badge
                    variant="outline"
                    style={(() => {
                      const styles = computeAccessibleLabelStyles(
                        formData.color || '#EF4444',
                        !!isDark
                      );
                      return styles
                        ? {
                            backgroundColor: styles.bg,
                            borderColor: styles.border,
                            color: styles.text,
                          }
                        : undefined;
                    })()}
                    className="font-medium"
                  >
                    {formData.name || 'Label Preview'}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleEdit}
                  disabled={isSubmitting || !formData.name.trim()}
                  className="flex-1"
                >
                  {isSubmitting ? 'Updating...' : 'Update Label'}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetForm}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingLabel}
        onOpenChange={(open) => !open && setDeletingLabel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Label</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the label{' '}
              <span className="font-semibold">
                &ldquo;{deletingLabel?.name}&rdquo;
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
