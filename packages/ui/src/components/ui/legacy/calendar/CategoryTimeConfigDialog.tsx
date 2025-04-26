import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import React, { useEffect, useState } from 'react';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { Copy, Clock, User, Briefcase, Plus, Trash } from 'lucide-react';
import { Switch } from '@tuturuuu/ui/switch';
import { CategoryTimeSetting as ContextCategoryTimeSetting, CategoryTimeSettings as ContextCategoryTimeSettings } from './settings/CalendarSettingsContext';

// Hours in a day
const HOURS_IN_DAY = Array.from({ length: 24 }, (_, i) => i);

// Days of week
const DAYS_OF_WEEK = [
  { value: 'monday', label: 'M', fullLabel: 'Monday' },
  { value: 'tuesday', label: 'T', fullLabel: 'Tuesday' },
  { value: 'wednesday', label: 'W', fullLabel: 'Wednesday' },
  { value: 'thursday', label: 'T', fullLabel: 'Thursday' },
  { value: 'friday', label: 'F', fullLabel: 'Friday' },
  { value: 'saturday', label: 'S', fullLabel: 'Saturday' },
  { value: 'sunday', label: 'S', fullLabel: 'Sunday' },
];

// Event types
const EVENT_TYPES = [
  { name: 'Work', color: 'BLUE' as SupportedColor, icon: Briefcase },
  { name: 'Meeting', color: 'CYAN' as SupportedColor, icon: Clock },
  { name: 'Personal', color: 'GREEN' as SupportedColor, icon: User },
];

// Interface for a time slot
interface TimeSlot {
  id: string;
  startHour: number;
  endHour: number;
}

// Extended types for internal use
interface CategoryTimeSetting extends ContextCategoryTimeSetting {
  timeSlots: Record<string, TimeSlot[]>; // Ensure timeSlots is required 
}

interface CategoryTimeSettings {
  [category: string]: CategoryTimeSetting;
}

// Default settings for a category
const DEFAULT_CATEGORY_SETTING: CategoryTimeSetting = {
  startHour: 9,
  endHour: 17,
  optimalHours: [9, 10, 11, 14, 15, 16],
  preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  timeSlots: {
    'monday': [{ id: 'monday-1', startHour: 9, endHour: 17 }],
    'tuesday': [{ id: 'tuesday-1', startHour: 9, endHour: 17 }],
    'wednesday': [{ id: 'wednesday-1', startHour: 9, endHour: 17 }],
    'thursday': [{ id: 'thursday-1', startHour: 9, endHour: 17 }],
    'friday': [{ id: 'friday-1', startHour: 9, endHour: 17 }],
  }
};

interface CategoryTimeConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSettings?: ContextCategoryTimeSettings;
  onSave: (settings: ContextCategoryTimeSettings) => void;
  selectedCategory?: string;
}

// Helper to generate unique IDs
const generateUniqueId = (): string => {
  return Math.random().toString(36).substring(2, 15);
};

export function CategoryTimeConfigDialog({
  open,
  onOpenChange,
  currentSettings = {},
  onSave,
  selectedCategory,
}: CategoryTimeConfigDialogProps) {
  // State
  const [activeTab, setActiveTab] = useState<string>(selectedCategory || (EVENT_TYPES[0]?.name ?? 'Work'));
  const [settings, setSettings] = useState<CategoryTimeSettings>(migrateSettings(currentSettings));
  const [dayIndex, setDayIndex] = useState<number>(0);
  
  // Migrate legacy settings to new format if needed
  function migrateSettings(oldSettings: ContextCategoryTimeSettings): CategoryTimeSettings {
    const newSettings: CategoryTimeSettings = { ...oldSettings as any };
    
    // Loop through each category
    Object.keys(newSettings).forEach(category => {
      const setting = newSettings[category];
      
      if (setting) {
        // If timeSlots doesn't exist or is empty, create it
        if (!setting.timeSlots || Object.keys(setting.timeSlots).length === 0) {
          setting.timeSlots = {};
          
          // For each preferred day, create a time slot with the start and end hours
          (setting.preferredDays || []).forEach(day => {
            setting.timeSlots[day] = [
              { 
                id: generateUniqueId(), 
                startHour: setting.startHour || 9, 
                endHour: setting.endHour || 17 
              }
            ];
          });
        } else {
          // Ensure all time slots have proper IDs
          Object.keys(setting.timeSlots).forEach(day => {
            const slots = setting.timeSlots[day];
            if (slots && slots.length > 0) {
              slots.forEach(slot => {
                if (!slot.id) {
                  slot.id = generateUniqueId();
                }
              });
            }
          });
        }

        // Ensure all preferred days have time slots
        (setting.preferredDays || []).forEach(day => {
          if (!setting.timeSlots[day] || setting.timeSlots[day].length === 0) {
            setting.timeSlots[day] = [
              { 
                id: generateUniqueId(), 
                startHour: setting.startHour || 9, 
                endHour: setting.endHour || 17 
              }
            ];
          }
        });
      }
    });
    
    console.log('Migrated settings:', JSON.stringify(newSettings, null, 2));
    return newSettings;
  }
  
  // Initialize settings
  useEffect(() => {
    if (!open) return;
    
    const newSettings: CategoryTimeSettings = { ...settings };
    let changed = false;
    
    // Add default settings for each event type if missing
    EVENT_TYPES.forEach(type => {
      if (!newSettings[type.name]) {
        changed = true;
        // Deep clone default settings
        newSettings[type.name] = JSON.parse(JSON.stringify(DEFAULT_CATEGORY_SETTING));
        
        // Generate unique IDs for each time slot
        const typeSettings = newSettings[type.name];
        if (typeSettings && typeSettings.timeSlots) {
          Object.keys(typeSettings.timeSlots).forEach(day => {
            const slots = typeSettings.timeSlots[day];
            if (slots) {
              slots.forEach(slot => {
                slot.id = generateUniqueId();
              });
            }
          });
        }
      }
    });
    
    if (changed) {
      setSettings(newSettings);
    }
  }, [open, settings]);
  
  // Set active tab when dialog opens or selected category changes
  useEffect(() => {
    if (open && selectedCategory) {
      setActiveTab(selectedCategory);
    }
  }, [open, selectedCategory]);
  
  // Helpers
  const formatHour = (hour: number): string => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour < 12 ? `${hour} AM` : `${hour-12} PM`;
  };
  
  const getCurrentDay = () => DAYS_OF_WEEK[dayIndex];
  
  // Get a category's settings with fallback to default
  const getTypeSettings = (eventType: string): CategoryTimeSetting => {
    return settings[eventType] || JSON.parse(JSON.stringify(DEFAULT_CATEGORY_SETTING));
  };
  
  // Get time slots for a specific day and event type
  const getTimeSlots = (eventType: string, day: string): TimeSlot[] => {
    const typeSettings = getTypeSettings(eventType);
    return (typeSettings.timeSlots && typeSettings.timeSlots[day]) || [];
  };
  
  // Handlers
  const handleDayToggle = (eventType: string, dayValue: string) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      
      // Get settings for this event type or create a new one
      if (!newSettings[eventType]) {
        newSettings[eventType] = JSON.parse(JSON.stringify(DEFAULT_CATEGORY_SETTING));
      }
      
      // Create a definite reference to the event settings
      const existingSettings = newSettings[eventType] || JSON.parse(JSON.stringify(DEFAULT_CATEGORY_SETTING));
      const eventSettings: CategoryTimeSetting = {
        preferredDays: [...(existingSettings.preferredDays || [])],
        timeSlots: { ...(existingSettings.timeSlots || {}) },
        optimalHours: [...(existingSettings.optimalHours || [])],
        startHour: existingSettings.startHour || 9,
        endHour: existingSettings.endHour || 17
      };
      
      if (eventSettings.preferredDays.includes(dayValue)) {
        // Remove day
        eventSettings.preferredDays = eventSettings.preferredDays.filter(d => d !== dayValue);
        // Remove time slots for this day
        if (eventSettings.timeSlots[dayValue]) {
          const newTimeSlots = { ...eventSettings.timeSlots };
          delete newTimeSlots[dayValue];
          eventSettings.timeSlots = newTimeSlots;
        }
      } else {
        // Add day
        eventSettings.preferredDays = [...eventSettings.preferredDays, dayValue];
        // Add default time slot for this day
        const newTimeSlots = { ...eventSettings.timeSlots };
        newTimeSlots[dayValue] = [
          { id: generateUniqueId(), startHour: 9, endHour: 17 }
        ];
        eventSettings.timeSlots = newTimeSlots;
      }
      
      newSettings[eventType] = eventSettings;
      return newSettings;
    });
  };
  
  // Add a new time slot for a day
  const addTimeSlot = (eventType: string, day: string) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      
      // Get settings for this event type or create a new one
      if (!newSettings[eventType]) {
        newSettings[eventType] = JSON.parse(JSON.stringify(DEFAULT_CATEGORY_SETTING));
      }
      
      // Create a definite reference to the event settings
      const existingSettings = newSettings[eventType] || JSON.parse(JSON.stringify(DEFAULT_CATEGORY_SETTING));
      const eventSettings: CategoryTimeSetting = {
        preferredDays: [...(existingSettings.preferredDays || [])],
        timeSlots: { ...(existingSettings.timeSlots || {}) },
        optimalHours: [...(existingSettings.optimalHours || [])],
        startHour: existingSettings.startHour || 9,
        endHour: existingSettings.endHour || 17
      };
      
      // Create or clone time slots for this day
      const daySlots = [...(eventSettings.timeSlots[day] || [])];
      
      // Add a new time slot
      // Use the end hour of the last slot as the start hour for the new slot, if possible
      const lastSlot = daySlots.length > 0 ? daySlots[daySlots.length - 1] : null;
      const startHour = lastSlot ? Math.min(lastSlot.endHour, 22) : 9;
      const endHour = Math.min(startHour + 2, 23);
      
      daySlots.push({
        id: generateUniqueId(),
        startHour,
        endHour
      });
      
      // Update time slots
      const newTimeSlots = { ...eventSettings.timeSlots };
      newTimeSlots[day] = daySlots;
      eventSettings.timeSlots = newTimeSlots;
      
      newSettings[eventType] = eventSettings;
      return newSettings;
    });
  };
  
  // Remove a time slot
  const removeTimeSlot = (eventType: string, day: string, slotId: string) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      
      // Get settings for this event type
      if (!newSettings[eventType]) return prev;
      
      // Create a definite reference to the event settings
      const existingSettings = newSettings[eventType] || JSON.parse(JSON.stringify(DEFAULT_CATEGORY_SETTING));
      const eventSettings: CategoryTimeSetting = {
        preferredDays: [...(existingSettings.preferredDays || [])],
        timeSlots: { ...(existingSettings.timeSlots || {}) },
        optimalHours: [...(existingSettings.optimalHours || [])],
        startHour: existingSettings.startHour || 9,
        endHour: existingSettings.endHour || 17
      };
      
      // Get time slots for this day
      const daySlots = [...(eventSettings.timeSlots[day] || [])];
      
      // Remove the slot with the given ID
      const updatedSlots = daySlots.filter(slot => slot.id !== slotId);
      
      // If there are no slots left, remove the day from preferred days
      if (updatedSlots.length === 0) {
        eventSettings.preferredDays = eventSettings.preferredDays.filter(d => d !== day);
        
        // Remove time slots for this day
        const newTimeSlots = { ...eventSettings.timeSlots };
        delete newTimeSlots[day];
        eventSettings.timeSlots = newTimeSlots;
      } else {
        // Update time slots
        const newTimeSlots = { ...eventSettings.timeSlots };
        newTimeSlots[day] = updatedSlots;
        eventSettings.timeSlots = newTimeSlots;
      }
      
      newSettings[eventType] = eventSettings;
      return newSettings;
    });
  };
  
  // Update a time slot
  const updateTimeSlot = (
    eventType: string, 
    day: string, 
    slotId: string, 
    startHour: number | null = null, 
    endHour: number | null = null
  ) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      
      // Get settings for this event type
      if (!newSettings[eventType]) return prev;
      
      // Create a definite reference to the event settings
      const existingSettings = newSettings[eventType] || JSON.parse(JSON.stringify(DEFAULT_CATEGORY_SETTING));
      const eventSettings: CategoryTimeSetting = {
        preferredDays: [...(existingSettings.preferredDays || [])],
        timeSlots: { ...(existingSettings.timeSlots || {}) },
        optimalHours: [...(existingSettings.optimalHours || [])],
        startHour: existingSettings.startHour || 9,
        endHour: existingSettings.endHour || 17
      };
      
      // Get time slots for this day
      const daySlots = [...(eventSettings.timeSlots[day] || [])];
      
      // Find and update the slot with the given ID
      const updatedSlots = daySlots.map(slot => {
        if (slot.id === slotId) {
          // Create a new object to avoid modifying the original
          const updatedSlot = { ...slot };
          
          // Update start hour if provided
          if (startHour !== null) {
            updatedSlot.startHour = startHour;
          }
          
          // Update end hour if provided
          if (endHour !== null) {
            updatedSlot.endHour = endHour;
          }
          
          // Ensure start hour is before end hour
          if (updatedSlot.startHour >= updatedSlot.endHour) {
            updatedSlot.endHour = updatedSlot.startHour + 1;
          }
          
          return updatedSlot;
        }
        return slot;
      });
      
      // Update time slots
      const newTimeSlots = { ...eventSettings.timeSlots };
      newTimeSlots[day] = updatedSlots;
      eventSettings.timeSlots = newTimeSlots;
      
      // Update legacy fields for backward compatibility
      if (updatedSlots.length > 0) {
        const allStartHours = updatedSlots.map(slot => slot.startHour);
        const allEndHours = updatedSlots.map(slot => slot.endHour);
        eventSettings.startHour = Math.min(...allStartHours);
        eventSettings.endHour = Math.max(...allEndHours);
        
        // Update optimal hours
        const optimalHours: number[] = [];
        updatedSlots.forEach(slot => {
          for (let hour = slot.startHour; hour <= slot.endHour; hour++) {
            if (!optimalHours.includes(hour)) {
              optimalHours.push(hour);
            }
          }
        });
        eventSettings.optimalHours = optimalHours;
      }
      
      newSettings[eventType] = eventSettings;
      return newSettings;
    });
  };
  
  const handleCopyToAllDays = (eventType: string) => {
    const currentDay = getCurrentDay();
    if (!currentDay) return;
    
    setSettings(prev => {
      const newSettings = { ...prev };
      
      // Get settings for this event type
      if (!newSettings[eventType]) return prev;
      
      // Create a definite reference to the event settings
      const existingSettings = newSettings[eventType] || JSON.parse(JSON.stringify(DEFAULT_CATEGORY_SETTING));
      const eventSettings: CategoryTimeSetting = {
        preferredDays: [...(existingSettings.preferredDays || [])],
        timeSlots: { ...(existingSettings.timeSlots || {}) },
        optimalHours: [...(existingSettings.optimalHours || [])],
        startHour: existingSettings.startHour || 9,
        endHour: existingSettings.endHour || 17
      };
      
      // Get time slots for the current day
      const currentDaySlots = [...(eventSettings.timeSlots[currentDay.value] || [])];
      if (currentDaySlots.length === 0) return prev;
      
      // Loop through all preferred days
      eventSettings.preferredDays.forEach(day => {
        if (day === currentDay.value) return; // Skip current day
        
        // Clone slots from current day, but with new IDs
        const newSlots = currentDaySlots.map(slot => ({
          id: generateUniqueId(),
          startHour: slot.startHour,
          endHour: slot.endHour
        }));
        
        // Update time slots for this day
        eventSettings.timeSlots[day] = newSlots;
      });
      
      newSettings[eventType] = eventSettings;
      return newSettings;
    });
  };
  
  const handleSave = () => {
    // Before saving, make sure the context properties are properly set
    const finalSettings: ContextCategoryTimeSettings = {};
    
    // Convert internal settings to context settings format
    Object.keys(settings).forEach((category) => {
      const setting = settings[category];
      if (setting) {
        // Make sure all preferred days have time slots
        setting.preferredDays.forEach(day => {
          if (!setting.timeSlots[day] || setting.timeSlots[day].length === 0) {
            setting.timeSlots[day] = [
              { 
                id: generateUniqueId(), 
                startHour: setting.startHour || 9, 
                endHour: setting.endHour || 17 
              }
            ];
          }
        });
        
        // Make sure all time slot days are in preferred days
        Object.keys(setting.timeSlots).forEach(day => {
          if (!setting.preferredDays.includes(day)) {
            // If a day has time slots but isn't preferred, add it to preferred days
            setting.preferredDays.push(day);
          }
        });
        
        // Update startHour and endHour based on time slots for backward compatibility
        // Gather all hours from all time slots
        let allHours: number[] = [];
        Object.values(setting.timeSlots).forEach(slots => {
          slots.forEach(slot => {
            // Add all hours within the slot's range
            for (let hour = slot.startHour; hour <= slot.endHour; hour++) {
              if (!allHours.includes(hour)) {
                allHours.push(hour);
              }
            }
          });
        });
        
        // Sort hours
        allHours.sort((a, b) => a - b);
        
        // If we have hours, update optimalHours, startHour, and endHour
        if (allHours.length > 0) {
          setting.startHour = allHours[0] || 9;
          setting.endHour = allHours[allHours.length - 1] || 17;
          setting.optimalHours = allHours;
        }
        
        // Add to final settings
        finalSettings[category] = {
          startHour: setting.startHour,
          endHour: setting.endHour,
          optimalHours: setting.optimalHours,
          preferredDays: setting.preferredDays,
          timeSlots: setting.timeSlots
        };
      }
    });
    
    console.log('Saving settings:', JSON.stringify(finalSettings, null, 2));
    
    // Call the onSave callback with the final settings
    onSave(finalSettings);
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Calendar Settings</DialogTitle>
          <DialogDescription>
            Configure your available hours for different activities. These settings help the calendar optimize scheduling and provide better suggestions.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            {EVENT_TYPES.map((type) => (
              <TabsTrigger 
                key={type.name} 
                value={type.name}
                className="flex items-center gap-2"
              >
                <type.icon className="h-4 w-4" />
                <span>{type.name} Hours</span>
              </TabsTrigger>
            ))}
          </TabsList>
          
          {EVENT_TYPES.map((type) => {
            const typeSettings = getTypeSettings(type.name);
            const currentDay = getCurrentDay();
            const isDayEnabled = currentDay && typeSettings.preferredDays.includes(currentDay.value);
            
            return (
              <TabsContent key={type.name} value={type.name} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: getEventStyles(type.color).bg }}
                    >
                      <type.icon className="h-3 w-3 text-primary-foreground" />
                    </div>
                    <h3 className="text-lg font-medium">{type.name} Hours</h3>
                  </div>
                  <div className="text-sm bg-muted px-2 py-1 rounded-md font-medium">
                    {typeSettings.preferredDays.length} days
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                  onClick={() => currentDay && handleCopyToAllDays(type.name)}
                >
                  <Copy className="h-4 w-4" />
                  Copy to all days
                </Button>
                
                <div className="flex space-x-2">
                  {DAYS_OF_WEEK.map((day, index) => (
                    <Button
                      key={day.value}
                      type="button"
                      variant={typeSettings.preferredDays.includes(day.value) ? "default" : "outline"}
                      className={cn(
                        "flex-1 transition-colors h-10 px-0",
                        dayIndex === index ? "ring-2 ring-ring" : "",
                        typeSettings.preferredDays.includes(day.value) ? "" : "text-muted-foreground"
                      )}
                      onClick={() => {
                        setDayIndex(index);
                        handleDayToggle(type.name, day.value);
                      }}
                    >
                      {day.label}
                    </Button>
                  ))}
        </div>
        
                {currentDay && (
                  <div className="space-y-4 p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`${type.name}-day`} className="font-medium">
                        {currentDay.fullLabel}
                      </Label>
                      <Switch 
                        id={`${type.name}-day`}
                        checked={isDayEnabled}
                        onCheckedChange={() => currentDay && handleDayToggle(type.name, currentDay.value)}
                      />
                    </div>
                    
                    {isDayEnabled && currentDay && (
                      <div className="space-y-4">
                        {/* Time slots */}
                        {getTimeSlots(type.name, currentDay.value).map((slot, slotIndex) => (
                          <div key={slot.id} className="flex items-end gap-2 pb-2 border-b border-dashed">
                            <div className="flex-1 grid grid-cols-2 gap-4">
                <div>
                                <Label htmlFor={`${type.name}-${slotIndex}-start`}>Start</Label>
                  <Select
                                  value={slot.startHour.toString()}
                                  onValueChange={(value) => updateTimeSlot(
                                    type.name, 
                                    currentDay.value,
                                    slot.id,
                                    parseInt(value), 
                                    null
                                  )}
                                >
                                  <SelectTrigger id={`${type.name}-${slotIndex}-start`} className="w-full">
                                    <SelectValue placeholder="Select start time" />
                    </SelectTrigger>
                    <SelectContent>
                                    {HOURS_IN_DAY.slice(0, 23).map((hour) => (
                        <SelectItem key={`start-${hour}`} value={hour.toString()}>
                          {formatHour(hour)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                                <Label htmlFor={`${type.name}-${slotIndex}-end`}>End</Label>
                  <Select
                                  value={slot.endHour.toString()}
                                  onValueChange={(value) => updateTimeSlot(
                                    type.name,
                                    currentDay.value,
                                    slot.id,
                                    null,
                                    parseInt(value)
                                  )}
                                >
                                  <SelectTrigger id={`${type.name}-${slotIndex}-end`} className="w-full">
                                    <SelectValue placeholder="Select end time" />
                    </SelectTrigger>
                    <SelectContent>
                                    {HOURS_IN_DAY.slice(1, 24).map((hour) => (
                        <SelectItem key={`end-${hour}`} value={hour.toString()}>
                          {formatHour(hour)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
                            {/* Only show remove button if there's more than one slot */}
                            {getTimeSlots(type.name, currentDay.value).length > 1 && (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 text-destructive"
                                onClick={() => removeTimeSlot(type.name, currentDay.value, slot.id)}
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        
                        {/* Add time slot button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 w-full"
                          onClick={() => currentDay && addTimeSlot(type.name, currentDay.value)}
                        >
                          <Plus className="h-4 w-4" />
                          Add Time Slot
                        </Button>
                      </div>
                    )}
                  </div>
                )}
            </TabsContent>
                  );
                })}
          </Tabs>
        
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 