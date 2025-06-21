'use client';

import { Button } from '@ncthub/ui/button';
import { Input } from '@ncthub/ui/input';
import { Label } from '@ncthub/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ncthub/ui/select';
import { Switch } from '@ncthub/ui/switch';
import { PlusIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';

export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskType = {
  id: string;
  name: string;
  defaultDuration: number; // in minutes
  defaultDeadlineOffset: number; // in days
  defaultPriority: TaskPriority;
};

export type TaskSettingsData = {
  defaultTaskTypes: TaskType[];
  autoScheduleTasks: boolean;
  scheduleHighPriorityFirst: boolean;
  respectWorkHours: boolean;
  defaultTaskDuration: number; // in minutes
};

export const defaultTaskSettings: TaskSettingsData = {
  defaultTaskTypes: [
    {
      id: '1',
      name: 'Quick Task',
      defaultDuration: 30,
      defaultDeadlineOffset: 1,
      defaultPriority: 'medium',
    },
    {
      id: '2',
      name: 'Project Work',
      defaultDuration: 120,
      defaultDeadlineOffset: 5,
      defaultPriority: 'high',
    },
    {
      id: '3',
      name: 'Research',
      defaultDuration: 60,
      defaultDeadlineOffset: 3,
      defaultPriority: 'medium',
    },
  ],
  autoScheduleTasks: true,
  scheduleHighPriorityFirst: true,
  respectWorkHours: true,
  defaultTaskDuration: 60,
};

type TaskSettingsProps = {
  value: TaskSettingsData;
  onChange: (value: TaskSettingsData) => void;
};

export function TaskSettings({ value, onChange }: TaskSettingsProps) {
  const [, setEditingTaskType] = useState<string | null>(null);

  const handleToggleChange = (
    field: keyof TaskSettingsData,
    checked: boolean
  ) => {
    onChange({
      ...value,
      [field]: checked,
    });
  };

  const handleDefaultDurationChange = (duration: string) => {
    const durationMinutes = parseInt(duration, 10);
    if (!isNaN(durationMinutes) && durationMinutes > 0) {
      onChange({
        ...value,
        defaultTaskDuration: durationMinutes,
      });
    }
  };

  const handleTaskTypeChange = (
    taskId: string,
    field: keyof Omit<TaskType, 'id'>,
    newValue: string | number | TaskPriority
  ) => {
    const updatedTaskTypes = value.defaultTaskTypes.map((task) => {
      if (task.id === taskId) {
        return {
          ...task,
          [field]: newValue,
        };
      }
      return task;
    });

    onChange({
      ...value,
      defaultTaskTypes: updatedTaskTypes,
    });
  };

  const addNewTaskType = () => {
    const newId = Date.now().toString();
    const newTaskType: TaskType = {
      id: newId,
      name: 'New Task Type',
      defaultDuration: 60,
      defaultDeadlineOffset: 1,
      defaultPriority: 'medium',
    };

    onChange({
      ...value,
      defaultTaskTypes: [...value.defaultTaskTypes, newTaskType],
    });

    setEditingTaskType(newId);
  };

  const removeTaskType = (taskId: string) => {
    onChange({
      ...value,
      defaultTaskTypes: value.defaultTaskTypes.filter(
        (task) => task.id !== taskId
      ),
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Task Scheduling</h3>

        <div className="flex items-center justify-between">
          <Label htmlFor="auto-schedule">Auto-schedule tasks</Label>
          <Switch
            id="auto-schedule"
            checked={value.autoScheduleTasks}
            onCheckedChange={(checked) =>
              handleToggleChange('autoScheduleTasks', checked)
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="priority-first">
            Schedule high priority tasks first
          </Label>
          <Switch
            id="priority-first"
            checked={value.scheduleHighPriorityFirst}
            onCheckedChange={(checked) =>
              handleToggleChange('scheduleHighPriorityFirst', checked)
            }
            disabled={!value.autoScheduleTasks}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="respect-hours">
            Respect work hours when scheduling
          </Label>
          <Switch
            id="respect-hours"
            checked={value.respectWorkHours}
            onCheckedChange={(checked) =>
              handleToggleChange('respectWorkHours', checked)
            }
            disabled={!value.autoScheduleTasks}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="default-duration">Default task duration</Label>
          <Select
            value={value.defaultTaskDuration.toString()}
            onValueChange={handleDefaultDurationChange}
          >
            <SelectTrigger id="default-duration" className="w-full">
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 minutes</SelectItem>
              <SelectItem value="30">30 minutes</SelectItem>
              <SelectItem value="45">45 minutes</SelectItem>
              <SelectItem value="60">1 hour</SelectItem>
              <SelectItem value="90">1.5 hours</SelectItem>
              <SelectItem value="120">2 hours</SelectItem>
              <SelectItem value="180">3 hours</SelectItem>
              <SelectItem value="240">4 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Task Types</h3>
          <Button variant="outline" size="sm" onClick={addNewTaskType}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add Type
          </Button>
        </div>

        <div className="space-y-4">
          {value.defaultTaskTypes.map((taskType) => (
            <div key={taskType.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Input
                  value={taskType.name}
                  onChange={(e) =>
                    handleTaskTypeChange(taskType.id, 'name', e.target.value)
                  }
                  className="font-medium"
                  placeholder="Task type name"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTaskType(taskType.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={`duration-${taskType.id}`}>
                    Default Duration
                  </Label>
                  <Select
                    value={taskType.defaultDuration.toString()}
                    onValueChange={(value) =>
                      handleTaskTypeChange(
                        taskType.id,
                        'defaultDuration',
                        parseInt(value, 10)
                      )
                    }
                  >
                    <SelectTrigger id={`duration-${taskType.id}`}>
                      <SelectValue placeholder="Duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="180">3 hours</SelectItem>
                      <SelectItem value="240">4 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`deadline-${taskType.id}`}>
                    Default Deadline
                  </Label>
                  <Select
                    value={taskType.defaultDeadlineOffset.toString()}
                    onValueChange={(value) =>
                      handleTaskTypeChange(
                        taskType.id,
                        'defaultDeadlineOffset',
                        parseInt(value, 10)
                      )
                    }
                  >
                    <SelectTrigger id={`deadline-${taskType.id}`}>
                      <SelectValue placeholder="Deadline" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Same day</SelectItem>
                      <SelectItem value="1">Next day</SelectItem>
                      <SelectItem value="2">In 2 days</SelectItem>
                      <SelectItem value="3">In 3 days</SelectItem>
                      <SelectItem value="5">In 5 days</SelectItem>
                      <SelectItem value="7">In 1 week</SelectItem>
                      <SelectItem value="14">In 2 weeks</SelectItem>
                      <SelectItem value="30">In 1 month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`priority-${taskType.id}`}>
                    Default Priority
                  </Label>
                  <Select
                    value={taskType.defaultPriority}
                    onValueChange={(value) =>
                      handleTaskTypeChange(
                        taskType.id,
                        'defaultPriority',
                        value as TaskPriority
                      )
                    }
                  >
                    <SelectTrigger id={`priority-${taskType.id}`}>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
