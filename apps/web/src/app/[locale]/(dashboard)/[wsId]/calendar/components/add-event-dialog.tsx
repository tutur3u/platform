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
import {
  CalendarIcon,
  ClockIcon,
  MinusIcon,
  PlusIcon,
  TagIcon,
  XIcon,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import React from 'react';

interface AddEventModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function AddEventModal({ isOpen, onClose }: AddEventModalProps) {
  const [formData, setFormData] = React.useState({
    title: '',
    duration: 1,
    splitUp: true,
    minDuration: 30,
    maxDuration: 2,
    workingHours: 'Working Hours',
    scheduleAfter: 'Now',
    dueDate: new Date('2025-06-23T18:00:00'),
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const incrementDuration = () => {
    setFormData((prev) => ({ ...prev, duration: prev.duration + 1 }));
  };

  const decrementDuration = () => {
    setFormData((prev) => ({
      ...prev,
      duration: Math.max(1, prev.duration - 1),
    }));
  };

  const handleSubmit = () => {
    // Handle form submission
    console.log('Form data:', formData);
    onClose?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>
            Schedule a new task with your preferred settings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Task Name Input */}
          <div className="space-y-2">
            <Label htmlFor="task-name">Task Name</Label>
            <div className="relative">
              <div className="absolute top-1/2 left-3 -translate-y-1/2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500">
                  <span className="text-sm text-white">☺</span>
                </div>
              </div>
              <Input
                id="task-name"
                placeholder="Enter task name..."
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className="pl-12"
              />
            </div>
          </div>

          {/* Duration Section */}
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <Label>Duration</Label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={decrementDuration}
                    className="h-9 w-9 rounded-full"
                  >
                    <MinusIcon className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[80px] text-center">
                    <span className="text-xl font-semibold">
                      {formData.duration}
                    </span>
                    <span className="ml-1 text-sm text-muted-foreground">
                      hr{formData.duration !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={incrementDuration}
                    className="h-9 w-9 rounded-full"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="split-up"
                  checked={formData.splitUp}
                  onCheckedChange={(checked) =>
                    handleInputChange('splitUp', checked)
                  }
                />
                <Label htmlFor="split-up" className="text-sm font-normal">
                  Split up
                </Label>
              </div>
            </div>

            {/* Min/Max Duration */}
            {formData.splitUp && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Min duration</Label>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <span className="text-sm font-medium">
                      {formData.minDuration} mins
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Max duration</Label>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <span className="text-sm font-medium">
                      {formData.maxDuration} hrs
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Working Hours */}
          <div className="space-y-2">
            <Label htmlFor="working-hours">Working Hours</Label>
            <Select
              value={formData.workingHours}
              onValueChange={(value) =>
                handleInputChange('workingHours', value)
              }
            >
              <SelectTrigger id="working-hours">
                <div className="flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 text-blue-500" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Working Hours">Working Hours</SelectItem>
                <SelectItem value="All Hours">All Hours</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Email Notice */}
          <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
            <div className="flex items-center gap-2">
              <span>📧</span>
              <span>Tasks will be scheduled for tanphat.huynh23@gmail.com</span>
            </div>
          </div>

          {/* Schedule After & Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Schedule after</Label>
              <div className="rounded-md border bg-muted/30 p-3">
                <span className="text-sm font-medium">
                  {formData.scheduleAfter}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Due date</Label>
              <div className="rounded-md border bg-muted/30 p-3">
                <span className="text-sm font-medium">Jun 23, 2025 6:00pm</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between pt-6">
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <TagIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ClockIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className="bg-blue-500 hover:bg-blue-600"
            >
              Create Task
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
