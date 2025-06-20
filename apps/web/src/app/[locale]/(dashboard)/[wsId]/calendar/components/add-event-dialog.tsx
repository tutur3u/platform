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
import { CalendarIcon, ClockIcon, PlusIcon } from '@tuturuuu/ui/icons';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import dayjs from 'dayjs';
import React from 'react';

interface AddEventModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function AddEventModal({ isOpen, onClose }: AddEventModalProps) {
  const [formData, setFormData] = React.useState({
    title: '',
    description: '',
    duration: 1,
    splitUp: true,
    minDuration: 0.5,
    maxDuration: 2,
    workingHours: 'working',
    scheduleAfter: '',
    dueDate: '',
  });

  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Task name is required';
    }

    if (formData.duration <= 0) {
      newErrors.duration = 'Duration must be greater than 0';
    }

    if (formData.splitUp) {
      if (formData.minDuration <= 0) {
        newErrors.minDuration = 'Minimum duration must be greater than 0';
      }

      if (formData.maxDuration <= 0) {
        newErrors.maxDuration = 'Maximum duration must be greater than 0';
      }

      if (formData.minDuration > formData.maxDuration) {
        newErrors.minDuration =
          'Minimum duration cannot be greater than maximum';
      }
    }

    if (formData.dueDate && dayjs(formData.dueDate).isBefore(dayjs())) {
      newErrors.dueDate = 'Due date cannot be in the past';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const updateFormData = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    console.log('Form data:', formData);
    handleClose();
  };

  const handleClose = () => {
    setFormData({
      title: '',
      description: '',
      duration: 1,
      splitUp: true,
      minDuration: 0.5,
      maxDuration: 2,
      workingHours: 'working',
      scheduleAfter: '',
      dueDate: '',
    });
    setErrors({});
    onClose?.();
  };

  const workingHoursOptions = [
    {
      value: 'working',
      label: 'Working Hours',
      icon: '💼',
      description: 'Schedule during standard work hours',
    },
    {
      value: 'all',
      label: 'All Hours',
      icon: '🌍',
      description: 'Schedule at any time of day',
    },
    {
      value: 'custom',
      label: 'Custom',
      icon: '⚙️',
      description: 'Define custom time preferences',
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusIcon className="h-5 w-5" />
            Create New Task
          </DialogTitle>
          <DialogDescription>
            Schedule a new task with your preferred settings and constraints.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">
                Task Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task-title"
                placeholder="e.g., Complete project documentation"
                value={formData.title}
                onChange={(e) => updateFormData('title', e.target.value)}
                className={errors.title ? 'border-destructive' : ''}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Description (Optional)</Label>
              <Textarea
                id="task-description"
                placeholder="Add any additional details about this task..."
                value={formData.description}
                onChange={(e) => updateFormData('description', e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <Separator />

          {/* Duration Settings */}
          <div className="space-y-4">
            <div className="mb-3 flex items-center gap-2">
              <ClockIcon className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Duration Settings</Label>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="duration" className="text-sm">
                  Total Duration (h) <span className="text-destructive">*</span>
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
                  <p className="text-xs text-destructive">{errors.duration}</p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="split-up"
                  checked={formData.splitUp}
                  onCheckedChange={(checked) =>
                    updateFormData('splitUp', checked)
                  }
                />
                <Label htmlFor="split-up" className="text-sm font-normal">
                  Allow splitting into smaller sessions
                </Label>
              </div>

              {formData.splitUp && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="min-duration" className="text-sm">
                      Min Duration (h){' '}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="min-duration"
                      type="number"
                      step="0.25"
                      min="0.25"
                      value={formData.minDuration}
                      onChange={(e) =>
                        updateFormData(
                          'minDuration',
                          parseFloat(e.target.value)
                        )
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
                      Max Duration (h){' '}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="max-duration"
                      type="number"
                      step="0.25"
                      min="0.25"
                      value={formData.maxDuration}
                      onChange={(e) =>
                        updateFormData(
                          'maxDuration',
                          parseFloat(e.target.value)
                        )
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
              )}

              <div className="rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
                <strong>Duration Guidelines:</strong>
                <ul className="mt-1 space-y-1">
                  <li>
                    • <strong>Total:</strong> How long this task should take
                    overall
                  </li>
                  {formData.splitUp && (
                    <>
                      <li>
                        • <strong>Min:</strong> Minimum time block needed for
                        meaningful progress
                      </li>
                      <li>
                        • <strong>Max:</strong> Maximum time to work on this
                        task at once
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          <Separator />

          {/* Scheduling Preferences */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="mb-2 flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Working Hours</Label>
              </div>
              <Select
                value={formData.workingHours}
                onValueChange={(value) => updateFormData('workingHours', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workingHoursOptions.map((option) => (
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-after" className="text-sm">
                  Schedule After (Optional)
                </Label>
                <Input
                  id="schedule-after"
                  type="datetime-local"
                  value={formData.scheduleAfter}
                  onChange={(e) =>
                    updateFormData('scheduleAfter', e.target.value)
                  }
                  min={dayjs().format('YYYY-MM-DDTHH:mm')}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="due-date" className="text-sm">
                    Due Date (Optional)
                  </Label>
                </div>
                <Input
                  id="due-date"
                  type="datetime-local"
                  value={formData.dueDate}
                  onChange={(e) => updateFormData('dueDate', e.target.value)}
                  min={dayjs().format('YYYY-MM-DDTHH:mm')}
                  className={errors.dueDate ? 'border-destructive' : ''}
                />
                {errors.dueDate && (
                  <p className="text-xs text-destructive">{errors.dueDate}</p>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              <div className="flex items-center gap-2">
                <span>📧</span>
                <span>
                  Tasks will be scheduled for tanphat.huynh23@gmail.com
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-500 hover:bg-blue-600">
              <PlusIcon className="mr-2 h-4 w-4" />
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
