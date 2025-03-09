'use client';

import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { EventPriority } from '@tuturuuu/types/primitives/calendar-event';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
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
import { cn } from '@tuturuuu/utils/format';
import { AlertCircle, Clock, MapPin } from 'lucide-react';
import { ReactNode } from 'react';

// Color options aligned with SupportedColor type
export const COLOR_OPTIONS: {
  value: SupportedColor;
  name: string;
  className: string;
}[] = [
  {
    value: 'BLUE',
    name: 'Blue',
    className: 'bg-dynamic-light-blue/20 hover:bg-dynamic-light-blue/50',
  },
  {
    value: 'RED',
    name: 'Red',
    className: 'bg-dynamic-light-red/20 hover:bg-dynamic-light-red/50',
  },
  {
    value: 'GREEN',
    name: 'Green',
    className: 'bg-dynamic-light-green/20 hover:bg-dynamic-light-green/50',
  },
  {
    value: 'YELLOW',
    name: 'Yellow',
    className: 'bg-dynamic-light-yellow/20 hover:bg-dynamic-light-yellow/50',
  },
  {
    value: 'ORANGE',
    name: 'Orange',
    className: 'bg-dynamic-light-orange/20 hover:bg-dynamic-light-orange/50',
  },
  {
    value: 'PURPLE',
    name: 'Purple',
    className: 'bg-dynamic-light-purple/20 hover:bg-dynamic-light-purple/50',
  },
  {
    value: 'PINK',
    name: 'Pink',
    className: 'bg-dynamic-light-pink/20 hover:bg-dynamic-light-pink/50',
  },
  {
    value: 'INDIGO',
    name: 'Indigo',
    className: 'bg-dynamic-light-indigo/20 hover:bg-dynamic-light-indigo/50',
  },
  {
    value: 'CYAN',
    name: 'Cyan',
    className: 'bg-dynamic-light-cyan/20 hover:bg-dynamic-light-cyan/50',
  },
  {
    value: 'GRAY',
    name: 'Gray',
    className: 'bg-dynamic-light-gray/20 hover:bg-dynamic-light-gray/50',
  },
];

// Priority options
export const PRIORITY_OPTIONS: {
  value: EventPriority;
  name: string;
  description: string;
  icon: ReactNode;
  className: string;
}[] = [
  {
    value: 'low',
    name: 'Low',
    description: 'Can be easily rescheduled',
    icon: <div className="h-2 w-2 rounded-full bg-blue-400"></div>,
    className: 'text-blue-600',
  },
  {
    value: 'medium',
    name: 'Medium',
    description: 'Standard priority',
    icon: <div className="h-2 w-2 rounded-full bg-green-400"></div>,
    className: 'text-green-600',
  },
  {
    value: 'high',
    name: 'High',
    description: 'Important, avoid rescheduling',
    icon: <div className="h-2 w-2 rounded-full bg-red-400"></div>,
    className: 'text-red-600',
  },
];

// Form section component for better organization
export const FormSection = ({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('space-y-3', className)}>
    <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
    <div className="space-y-4">{children}</div>
  </div>
);

// Event title input component
export const EventTitleInput = ({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Label htmlFor="title" className="text-sm font-medium">
      Event Title
    </Label>
    <Input
      id="title"
      placeholder="Add title"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-none bg-muted/50 focus-visible:ring-0 focus-visible:ring-offset-0"
      disabled={disabled}
    />
  </div>
);

// Event description textarea component
export const EventDescriptionInput = ({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Label htmlFor="description" className="text-sm font-medium">
      Description
    </Label>
    <Textarea
      id="description"
      placeholder="Add description"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-24 resize-none border-none bg-muted/50 focus-visible:ring-0 focus-visible:ring-offset-0"
      disabled={disabled}
    />
  </div>
);

// Event location input component
export const EventLocationInput = ({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Label
      htmlFor="location"
      className="flex items-center gap-2 text-sm font-medium"
    >
      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
      Location
    </Label>
    <Input
      id="location"
      placeholder="Add location"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-none bg-muted/50 focus-visible:ring-0 focus-visible:ring-offset-0"
      disabled={disabled}
    />
  </div>
);

// Date and time picker component
export const EventDateTimePicker = ({
  label,
  value,
  onChange,
  disabled = false,
  icon,
}: {
  label: string;
  value: Date;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  icon?: ReactNode;
}) => (
  <div className="space-y-2">
    <Label className="flex items-center gap-2 text-sm font-medium">
      {icon || <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
      {label}
    </Label>
    <div className={cn(disabled ? 'pointer-events-none opacity-50' : '')}>
      <DateTimePicker date={value} setDate={(date) => onChange(date)} />
    </div>
  </div>
);

// Color picker component
export const EventColorPicker = ({
  value,
  onChange,
  disabled = false,
}: {
  value: SupportedColor;
  onChange: (value: SupportedColor) => void;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Label htmlFor="color" className="text-sm font-medium">
      Color
    </Label>
    <Select
      value={value}
      onValueChange={(val) => onChange(val as SupportedColor)}
      disabled={disabled}
    >
      <SelectTrigger
        id="color"
        className={cn(
          'border-none bg-muted/50 focus:ring-0',
          COLOR_OPTIONS.find((c) => c.value === value)?.className
        )}
      >
        <SelectValue placeholder="Select a color" />
      </SelectTrigger>
      <SelectContent>
        <div className="grid grid-cols-2 gap-1">
          {COLOR_OPTIONS.map((color) => (
            <SelectItem
              key={color.value}
              value={color.value}
              className={cn('cursor-pointer', color.className)}
            >
              {color.name}
            </SelectItem>
          ))}
        </div>
      </SelectContent>
    </Select>
  </div>
);

// Priority picker component
export const EventPriorityPicker = ({
  value,
  onChange,
  disabled = false,
}: {
  value: EventPriority;
  onChange: (value: EventPriority) => void;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Label htmlFor="priority" className="text-sm font-medium">
      Priority
    </Label>
    <Select
      value={value}
      onValueChange={(val) => onChange(val as EventPriority)}
      disabled={disabled}
    >
      <SelectTrigger
        id="priority"
        className="border-none bg-muted/50 focus:ring-0"
      >
        <SelectValue placeholder="Select priority" />
      </SelectTrigger>
      <SelectContent>
        {PRIORITY_OPTIONS.map((priority) => (
          <SelectItem
            key={priority.value}
            value={priority.value}
            className={cn(
              'flex cursor-pointer items-center gap-2',
              priority.className
            )}
          >
            <div className="flex items-center gap-2">
              {priority.icon}
              <span>{priority.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {priority.description}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

// Toggle switch component
export const EventToggleSwitch = ({
  id,
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <div className="flex items-center justify-between space-x-2">
    <div className="space-y-0.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
    />
  </div>
);

// Overlap warning component
export const OverlapWarning = ({
  overlappingEvents,
}: {
  overlappingEvents: any[];
}) => {
  if (overlappingEvents.length === 0) return null;

  return (
    <Alert className="mt-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Scheduling Conflict</AlertTitle>
      <AlertDescription className="text-sm">
        This event overlaps with {overlappingEvents.length} other{' '}
        {overlappingEvents.length === 1 ? 'event' : 'events'}.
        <ul className="mt-2 list-inside list-disc">
          {overlappingEvents.slice(0, 3).map((event, index) => (
            <li key={index} className="text-xs">
              {event.title} (
              {new Date(event.start_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              -{' '}
              {new Date(event.end_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              )
            </li>
          ))}
          {overlappingEvents.length > 3 && (
            <li className="text-xs">
              ...and {overlappingEvents.length - 3} more
            </li>
          )}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

// Date error component
export const DateError = ({ error }: { error: string | null }) => {
  if (!error) return null;

  return (
    <Alert variant="destructive" className="mt-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Invalid Date Range</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
};

// Action buttons component
export const EventActionButtons = ({
  isEditing,
  onSave,
  onDelete,
  onCancel,
  isSaving,
  isDeleting,
  showDelete = true,
}: {
  isEditing: boolean;
  onSave: () => void;
  onDelete?: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isDeleting: boolean;
  showDelete?: boolean;
}) => (
  <div className="flex justify-between">
    <div>
      {isEditing && showDelete && (
        <Button
          variant="destructive"
          onClick={onDelete}
          disabled={isSaving || isDeleting}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
      )}
    </div>
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={onCancel}
        disabled={isSaving || isDeleting}
      >
        Cancel
      </Button>
      <Button onClick={onSave} disabled={isSaving || isDeleting}>
        {isSaving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
      </Button>
    </div>
  </div>
);
