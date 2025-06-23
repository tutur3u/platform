'use client';

import type { Task, TaskPriority } from '@tuturuuu/ai/scheduling/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { PlusIcon } from '@tuturuuu/ui/icons';
import { SplitIcon } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import dayjs from 'dayjs';
import { useState } from 'react';

interface TaskModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  onAddTaskAction: (task: Omit<Task, 'id' | 'events'>) => void;
}

const categoryOptions = [
  {
    value: 'work',
    label: 'Work',
    icon: '💼',
    description: 'Professional tasks and projects',
  },
  {
    value: 'personal',
    label: 'Personal',
    icon: '🏠',
    description: 'Personal activities and hobbies',
  },
  {
    value: 'meeting',
    label: 'Meeting',
    icon: '👥',
    description: 'Meetings and collaborative sessions',
  },
] as const;

const priorityOptions = [
  {
    value: 'critical' as TaskPriority,
    label: 'Critical',
    icon: '🚨',
    description: 'Urgent tasks that must be completed immediately',
    color: 'text-red-600',
  },
  {
    value: 'high' as TaskPriority,
    label: 'High',
    icon: '⚡',
    description: 'Important tasks with tight deadlines',
    color: 'text-orange-600',
  },
  {
    value: 'normal' as TaskPriority,
    label: 'Normal',
    icon: '📋',
    description: 'Standard priority tasks',
    color: 'text-blue-600',
  },
  {
    value: 'low' as TaskPriority,
    label: 'Low',
    icon: '📝',
    description: 'Tasks that can be done when time permits',
    color: 'text-gray-600',
  },
] as const;

export function TaskModal({
  isOpen,
  onCloseAction,
  onAddTaskAction,
}: TaskModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration: 1,
    minDuration: 0.5,
    maxDuration: 2,
    category: 'work' as 'work' | 'personal' | 'meeting',
    priority: 'normal' as TaskPriority,
    deadline: '',
    allowSplit: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Task name is required';
    }

    if (formData.duration <= 0) {
      newErrors.duration = 'Duration must be greater than 0';
    }

    if (formData.minDuration <= 0) {
      newErrors.minDuration = 'Minimum duration must be greater than 0';
    }

    if (formData.maxDuration <= 0) {
      newErrors.maxDuration = 'Maximum duration must be greater than 0';
    }

    if (formData.minDuration > formData.maxDuration) {
      newErrors.minDuration = 'Minimum duration cannot be greater than maximum';
    }

    if (formData.duration < formData.minDuration) {
      newErrors.duration = 'Duration cannot be less than minimum duration';
    }

    if (formData.deadline && dayjs(formData.deadline).isBefore(dayjs())) {
      newErrors.deadline = 'Deadline cannot be in the past';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const newTask: Omit<Task, 'id' | 'events'> = {
      name: formData.name,
      duration: formData.duration,
      minDuration: formData.minDuration,
      maxDuration: formData.maxDuration,
      category: formData.category,
      priority: formData.priority,
      deadline: formData.deadline ? dayjs(formData.deadline) : undefined,
      allowSplit: formData.allowSplit,
    };

    onAddTaskAction(newTask);
    handleClose();
  };

  const handleClose = () => {
    setFormData({
      name: '',
      description: '',
      duration: 1,
      minDuration: 0.5,
      maxDuration: 2,
      category: 'work',
      priority: 'normal',
      deadline: '',
      allowSplit: true,
    });
    setErrors({});
    onCloseAction();
  };

  const updateFormData = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusIcon className="h-5 w-5" />
            Add New Task
          </DialogTitle>
          <DialogDescription>
            Create a new task with scheduling constraints and preferences.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Basic Information, Duration, Category, Deadline in horizontal layout */}
          <div className="flex flex-row gap-6">
            {/* Left column: Basic info and description */}
            <div className="flex min-w-[220px] flex-1 flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="task-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="task-name"
                  placeholder="e.g., Design homepage wireframes"
                  value={formData.name}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  placeholder="Add any additional details about this task..."
                  value={formData.description}
                  onChange={(e) =>
                    updateFormData('description', e.target.value)
                  }
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <div className="mb-2 flex items-center gap-2">
                  <SplitIcon className="h-4 w-4 text-blue-600" />
                  <Label htmlFor="allow-split" className="text-sm font-medium">
                    Allow task splitting
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="allow-split"
                    checked={formData.allowSplit}
                    onCheckedChange={(checked) =>
                      updateFormData('allowSplit', checked)
                    }
                  />
                  <Label
                    htmlFor="allow-split"
                    className="text-sm text-muted-foreground"
                  >
                    Split this task into smaller sessions if needed
                  </Label>
                </div>
              </div>
            </div>

            {/* Right column: Duration, Category, Priority, Deadline */}
            <div className="flex min-w-[220px] flex-1 flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="duration">
                    Duration <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="duration"
                    type="number"
                    step="0.25"
                    min="0.25"
                    placeholder="1.0"
                    value={formData.duration}
                    onChange={(e) =>
                      updateFormData('duration', parseFloat(e.target.value))
                    }
                    className={errors.duration ? 'border-destructive' : ''}
                  />
                  {errors.duration && (
                    <p className="text-xs text-destructive">
                      {errors.duration}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-duration">Min Duration</Label>
                  <Input
                    id="min-duration"
                    type="number"
                    step="0.25"
                    min="0.25"
                    placeholder="0.5"
                    value={formData.minDuration}
                    onChange={(e) =>
                      updateFormData('minDuration', parseFloat(e.target.value))
                    }
                    className={errors.minDuration ? 'border-destructive' : ''}
                  />
                  {errors.minDuration && (
                    <p className="text-xs text-destructive">
                      {errors.minDuration}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-duration">Max Duration</Label>
                  <Input
                    id="max-duration"
                    type="number"
                    step="0.25"
                    min="0.25"
                    placeholder="2.0"
                    value={formData.maxDuration}
                    onChange={(e) =>
                      updateFormData('maxDuration', parseFloat(e.target.value))
                    }
                    className={errors.maxDuration ? 'border-destructive' : ''}
                  />
                  {errors.maxDuration && (
                    <p className="text-xs text-destructive">
                      {errors.maxDuration}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">
                  Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.category}
                  onValueChange={(value: 'work' | 'personal' | 'meeting') =>
                    updateFormData('category', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <span>{option.icon}</span>
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">
                  Priority <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: TaskPriority) =>
                    updateFormData('priority', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <span>{option.icon}</span>
                          <span className={option.color}>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline (Optional)</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => updateFormData('deadline', e.target.value)}
                  className={errors.deadline ? 'border-destructive' : ''}
                  min={dayjs().format('YYYY-MM-DDTHH:mm')}
                />
                {errors.deadline && (
                  <p className="text-xs text-destructive">{errors.deadline}</p>
                )}
              </div>
            </div>
          </div>

          {/* Priority and Category Descriptions */}
          <div className="rounded-lg bg-muted/50 p-4">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  Selected Category
                </h4>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {
                      categoryOptions.find(
                        (opt) => opt.value === formData.category
                      )?.icon
                    }
                  </span>
                  <span>
                    {
                      categoryOptions.find(
                        (opt) => opt.value === formData.category
                      )?.description
                    }
                  </span>
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  Selected Priority
                </h4>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {
                      priorityOptions.find(
                        (opt) => opt.value === formData.priority
                      )?.icon
                    }
                  </span>
                  <span>
                    {
                      priorityOptions.find(
                        (opt) => opt.value === formData.priority
                      )?.description
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700"
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
