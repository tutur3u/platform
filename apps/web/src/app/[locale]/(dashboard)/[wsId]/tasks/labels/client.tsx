'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Calendar,
  Edit2,
  Palette,
  Plus,
  Tag,
  Trash2,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
  const [labels, setLabels] = useState<TaskLabel[]>(initialLabels);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<TaskLabel | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    color: colorPresets[0],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleDelete = async (labelId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this label? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/labels/${labelId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete label');
      }

      setLabels((prev) => prev.filter((label) => label.id !== labelId));
      toast.success('Label deleted successfully');
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Tag className="h-4 w-4" />
          <span>
            {labels.length} label{labels.length !== 1 ? 's' : ''}
          </span>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Label
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Label</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Enter label name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    className="h-10 w-12 rounded border p-1"
                  />
                  <div className="flex gap-1">
                    {colorPresets.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="h-6 w-6 rounded border-2 border-gray-300 hover:border-gray-400"
                        style={{ backgroundColor: color }}
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, color }))
                        }
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge
                    style={{ backgroundColor: formData.color, color: '#fff' }}
                  >
                    {formData.name || 'Preview'}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleCreate}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? 'Creating...' : 'Create Label'}
                </Button>
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Labels Grid */}
      {labels.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-muted p-4">
              <Tag className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">No labels yet</h3>
              <p className="text-muted-foreground">
                Create your first label to start organizing your tasks
              </p>
            </div>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Label
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {labels.map((label) => (
            <Card
              key={label.id}
              className="p-4 transition-shadow hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <Badge
                    style={{ backgroundColor: label.color, color: '#fff' }}
                    className="font-medium"
                  >
                    {label.name}
                  </Badge>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(label)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(label.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 text-muted-foreground text-sm">
                  <div className="flex items-center gap-2">
                    <Palette className="h-3 w-3" />
                    <span>{label.color}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {new Date(label.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      {editingLabel && (
        <Dialog open={!!editingLabel} onOpenChange={() => resetForm()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Label</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  placeholder="Enter label name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    className="h-10 w-12 rounded border p-1"
                  />
                  <div className="flex gap-1">
                    {colorPresets.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="h-6 w-6 rounded border-2 border-gray-300 hover:border-gray-400"
                        style={{ backgroundColor: color }}
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, color }))
                        }
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge
                    style={{ backgroundColor: formData.color, color: '#fff' }}
                  >
                    {formData.name || 'Preview'}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleEdit}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? 'Updating...' : 'Update Label'}
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
