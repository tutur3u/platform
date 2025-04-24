'use client';

import { ColorPicker, colorMap } from './settings/ColorPicker';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { EventPriority } from '@tuturuuu/types/primitives/calendar-event';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Slider } from '@tuturuuu/ui/slider';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import { AlertCircle, Clock, MapPin, ChevronsUpDown, Check } from 'lucide-react';
import { ReactNode, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tuturuuu/ui/popover';

// Color options aligned with SupportedColor type
export const COLOR_OPTIONS: {
  value: SupportedColor;
  name: string;
  className: string;
}[] = Object.entries(colorMap).map(([key, value]) => ({
  value: key as SupportedColor,
  name: value.name,
  className: `bg-dynamic-light-${key.toLowerCase()}/20 hover:bg-dynamic-light-${key.toLowerCase()}/50`,
}));

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
  onEnter,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
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
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnter?.();
        }
      }}
      autoFocus
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
}) => {
  // function to open Google Maps with the entered address
  const openGoogleMaps = () => {
    if (value) {
      // encode the address to be used in the URL
      const encodedAddress = encodeURIComponent(value);
      // open Google Maps in a new tab
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
        '_blank'
      );
    }
  };

  return (
    <div className="space-y-2">
      <Label
        htmlFor="location"
        className="flex items-center gap-2 text-sm font-medium"
      >
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
        Location
      </Label>
      <div className="relative">
        <Input
          id="location"
          placeholder="Add location"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-none bg-muted/50 pr-10 focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={disabled}
        />
        {value && (
          <button
            type="button"
            onClick={openGoogleMaps}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="Open in Google Maps"
          >
            <MapPin className="h-4 w-4" />
          </button>
        )}
      </div>
      {value && (
        <div className="flex items-center text-xs text-muted-foreground">
          <span>Click the map icon to view in Google Maps</span>
        </div>
      )}
    </div>
  );
};

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
}) => {
  const { text } = getEventStyles(value);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Color</Label>
      <div className={cn(disabled ? 'pointer-events-none opacity-50' : '')}>
        <div className="flex flex-col space-y-3">
          <ColorPicker
            value={value}
            onChange={onChange}
            size="md"
            showTooltips={true}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={cn('h-3 w-3 rounded-full', text)} />
            <span>
              {COLOR_OPTIONS.find((c) => c.value === value)?.name || 'Blue'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Priority picker component
export const EventPriorityPicker = ({
  value,
  onChange,
  disabled = false,
}: {
  value: EventPriority;
  onChange: (value: EventPriority) => void;
  disabled?: boolean;
}) => {
  const priorityOptions = [
    { value: 'low', label: 'Low Priority', color: 'text-blue-500' },
    { value: 'medium', label: 'Medium Priority', color: 'text-green-500' },
    { value: 'high', label: 'High Priority', color: 'text-red-500' },
  ];

  const priorityToValue = {
    low: 0,
    medium: 1,
    high: 2,
  };

  const valueToPriority = (val: number): EventPriority => {
    if (val === 0) return 'low';
    if (val === 1) return 'medium';
    return 'high';
  };

  return (
    <div className="space-y-4">
      <Label htmlFor="priority" className="text-sm font-medium">
        Priority
      </Label>
      <div className={cn('space-y-3', disabled ? 'opacity-50' : '')}>
        <Slider
          id="priority"
          min={0}
          max={2}
          step={1}
          value={[priorityToValue[value]]}
          onValueChange={(vals) => onChange(valueToPriority(vals[0] ?? 0))}
          disabled={disabled}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          {priorityOptions.map((option) => (
            <div
              key={option.value}
              className={cn(
                'font-medium',
                option.color,
                value === option.value ? 'opacity-100' : 'opacity-50'
              )}
            >
              {option.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

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

// Event category picker component
export function EventCategoryPicker({
  value,
  onChange,
  categories,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: { name: string; color: SupportedColor }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  
  // Required categories
  const REQUIRED_CATEGORIES = ['Work', 'Meeting', 'Personal'];
  
  console.log('Original categories:', categories);
  
  // Create map of categories for easier lookup
  const categoryMap = new Map(
    categories.map(cat => [cat.name.toLowerCase(), cat])
  );
  
  // Create display list ensuring always 3 categories
  const displayCategories = REQUIRED_CATEGORIES.map(requiredName => {
    // Find in existing categories (case insensitive)
    const existingCategory = categories.find(
      cat => cat.name.toLowerCase() === requiredName.toLowerCase()
    );
    
    // If found, use it, otherwise create default
    if (existingCategory) {
      return existingCategory;
    } else {
      // Create default color for each category type
      let defaultColor: SupportedColor = 'BLUE';
      if (requiredName === 'Meeting') defaultColor = 'CYAN';
      if (requiredName === 'Work') defaultColor = 'GREEN';
      if (requiredName === 'Personal') defaultColor = 'GREEN';
      
      return { name: requiredName, color: defaultColor };
    }
  });
  
  console.log('Display categories:', displayCategories);

  return (
    <div className="space-y-2">
      <Label htmlFor="category" className="text-sm font-medium">
        Event Category
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            {value
              ? displayCategories.find((category) => category.name.toLowerCase() === value.toLowerCase())?.name || value
              : "Select category..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput placeholder="Search categories..." />
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {displayCategories.map((category) => {
                  const { bg, text } = getEventStyles(category.color);
                  return (
                    <CommandItem
                      key={category.name}
                      value={category.name}
                      onSelect={() => {
                        onChange(category.name);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${bg}`}></div>
                        <span>{category.name}</span>
                      </div>
                      <Check
                        className={cn(
                          "ml-auto h-4 w-4",
                          value.toLowerCase() === category.name.toLowerCase() ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
      Select event type will automatically set appropriate color
      </p>
    </div>
  );
}
