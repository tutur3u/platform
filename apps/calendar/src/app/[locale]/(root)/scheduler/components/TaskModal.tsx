'use client';

import type { Task } from '@tuturuuu/ai/scheduling/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { CalendarIcon, ClockIcon, PlusIcon, TagIcon } from '@tuturuuu/ui/icons';
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
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import dayjs from 'dayjs';
import { useState } from 'react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTask: (task: Omit<Task, 'id' | 'events'>) => void;
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

export function TaskModal({ isOpen, onClose, onAddTask }: TaskModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration: 1,
    minDuration: 0.5,
    maxDuration: 2,
    category: 'work' as 'work' | 'personal' | 'meeting',
    deadline: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
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
      deadline: formData.deadline ? dayjs(formData.deadline) : undefined,
      allowSplit: formData.allowSplit,
    };

    onAddTask(newTask);
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
      deadline: '',
      priority: 'medium',
      allowSplit: true,
    });
    setErrors({});
    onClose();
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
                  <TagIcon className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Category</Label>
                </div>
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
                          <div>
                            <div className="font-medium">{option.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {option.description}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="deadline" className="text-sm font-medium">
                    Deadline
                  </Label>
                </div>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => updateFormData('deadline', e.target.value)}
                  min={dayjs().format('YYYY-MM-DDTHH:mm')}
                  className={errors.deadline ? 'border-destructive' : ''}
                />
                {errors.deadline && (
                  <p className="text-sm text-destructive">{errors.deadline}</p>
                )}
              </div>
            </div>

            {/* Right column: Duration and split toggle */}
            <div className="flex min-w-[220px] flex-1 flex-col gap-4">
              <div className="mb-2 flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Duration</Label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="duration" className="text-sm">
                    Total (h) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="duration"
                    type="number"
                    step="0.25"
                    min="0.25"
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
                  <Label htmlFor="min-duration" className="text-sm">
                    Min (h) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="min-duration"
                    type="number"
                    step="0.25"
                    min="0.25"
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
                  <Label htmlFor="max-duration" className="text-sm">
                    Max (h) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="max-duration"
                    type="number"
                    step="0.25"
                    min="0.25"
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
              <div className="pb-1 pl-1 text-xs text-muted-foreground">
                Total = overall time. Min/Max = per session.
              </div>
              {/* Split Task Toggle */}
              <div className="mt-2 flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
                <SplitIcon className="h-5 w-5 text-primary" />
                <Switch
                  id="allow-split"
                  checked={formData.allowSplit}
                  onCheckedChange={(checked) =>
                    updateFormData('allowSplit', checked)
                  }
                />
                <Label htmlFor="allow-split" className="text-sm font-medium">
                  Allow split
                </Label>
                <span className="ml-2 text-xs text-muted-foreground">
                  Let this task be split into sessions
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit">
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
