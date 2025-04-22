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
import { Separator } from '@tuturuuu/ui/separator';
import { useEffect, useState } from 'react';
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
import { Toggle } from '@tuturuuu/ui/toggle';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';

// Define hours in a day
const HOURS_IN_DAY = Array.from({ length: 24 }, (_, i) => i);
const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

// Define data type for optimal hours
interface OptimalHour {
  hour: number;
  selected: boolean;
}

// Define data type for category time settings
interface CategoryTimeSetting {
  startHour: number;
  endHour: number;
  optimalHours: number[];
  preferredDays: string[];
}

// Define data type for all category time settings
interface CategoryTimeSettings {
  [category: string]: CategoryTimeSetting;
}

interface CategoryTimeConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: { name: string; color: SupportedColor }[];
  currentSettings?: CategoryTimeSettings;
  onSave: (settings: CategoryTimeSettings) => void;
  selectedCategory?: string;
}

export function CategoryTimeConfigDialog({
  open,
  onOpenChange,
  categories,
  currentSettings = {},
  onSave,
  selectedCategory,
}: CategoryTimeConfigDialogProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(selectedCategory || null);
  const [timeSettings, setTimeSettings] = useState<CategoryTimeSettings>(currentSettings || {});
  const [optimalHours, setOptimalHours] = useState<OptimalHour[]>([]);
  
  // Initialize timeSettings if not already set - only run when open or categories/settings change
  useEffect(() => {
    if (!open) return; // Don't perform when dialog is closed
    
    const hasInitializedSettings = Object.keys(timeSettings).length > 0;
    if (hasInitializedSettings && !selectedCategory) return; // Already initialized and no new category

    const newSettings: CategoryTimeSettings = { ...timeSettings };
    
    // Only add categories that don't already exist in settings
    let hasChanges = false;
    categories.forEach(cat => {
      if (!newSettings[cat.name]) {
        hasChanges = true;
        newSettings[cat.name] = {
          startHour: 9,  // Default 9am
          endHour: 17,   // Default 5pm
          optimalHours: [9, 10, 11, 14, 15, 16], // Default working hours
          preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] // Default work days
        };
      }
    });
    
    // Only update state if there are changes
    if (hasChanges) {
      setTimeSettings(newSettings);
    }
  }, [categories, open, selectedCategory]); // Removed currentSettings and timeSettings
  
  // Reset activeCategory when dialog opens
  useEffect(() => {
    if (open) {
      if (selectedCategory) {
        setActiveCategory(selectedCategory);
      } else if (categories.length > 0 && !activeCategory) {
        setActiveCategory(categories[0]?.name || '');
      }
    }
  }, [open, selectedCategory, categories, activeCategory]);
  
  // Update optimal hours when the dialog opens or when active category changes
  useEffect(() => {
    if (!open || !activeCategory) return;
    
    const categorySettings = timeSettings[activeCategory];
    if (!categorySettings) return;
    
    const updatedHours: OptimalHour[] = [];
    for (let hour = categorySettings.startHour; hour <= categorySettings.endHour; hour++) {
      updatedHours.push({
        hour,
        selected: categorySettings.optimalHours.includes(hour)
      });
    }
    
    setOptimalHours(updatedHours);
  }, [open, activeCategory, timeSettings]);
  
  // Handle category change
  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
  };
  
  // Handle start hour change
  const handleStartHourChange = (hour: string) => {
    if (!activeCategory) return;
    
    const startHour = parseInt(hour);
    
    setTimeSettings(prev => {
      const settings = { ...prev };
      // Ensure we always have an object for the current category
      if (!settings[activeCategory]) {
        settings[activeCategory] = {
          startHour: 9,
          endHour: 17,
          optimalHours: [9, 10, 11, 14, 15, 16],
          preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        };
      }
      
      const categorySettings = settings[activeCategory];
      
      // Start hour cannot be later than end hour
      if (startHour < categorySettings.endHour) {
        categorySettings.startHour = startHour;
      } else {
        // If start hour is later than end hour, update both
        categorySettings.startHour = startHour;
        categorySettings.endHour = startHour + 1;
      }
      
      // Filter optimalHours to only keep hours in valid range
      categorySettings.optimalHours = categorySettings.optimalHours.filter(
        hour => hour >= categorySettings.startHour && hour <= categorySettings.endHour
      );
      
      return settings;
    });
  };
  
  // Handle end hour change
  const handleEndHourChange = (hour: string) => {
    if (!activeCategory) return;
    
    const endHour = parseInt(hour);
    
    setTimeSettings(prev => {
      const settings = { ...prev };
      // Ensure we always have an object for the current category
      if (!settings[activeCategory]) {
        settings[activeCategory] = {
          startHour: 9,
          endHour: 17,
          optimalHours: [9, 10, 11, 14, 15, 16],
          preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        };
      }
      
      const categorySettings = settings[activeCategory];
      
      // End hour cannot be earlier than start hour
      if (endHour > categorySettings.startHour) {
        categorySettings.endHour = endHour;
      } else {
        // If end hour is earlier than start hour, update both
        categorySettings.endHour = endHour;
        categorySettings.startHour = endHour - 1;
      }
      
      // Filter optimalHours to only keep hours in valid range
      categorySettings.optimalHours = categorySettings.optimalHours.filter(
        hour => hour >= categorySettings.startHour && hour <= categorySettings.endHour
      );
      
      return settings;
    });
  };
  
  // Handle optimal hour toggle
  const handleOptimalHourToggle = (hour: number) => {
    console.log(`Toggling optimal hour: ${hour}`);
    
    if (!activeCategory) return;
    
    setTimeSettings((prevSettings) => {
      const currentCategorySettings = { ...(prevSettings[activeCategory] || {
        startHour: 9,
        endHour: 17,
        optimalHours: [],
        preferredDays: []
      }) };
      
      // Toggle the hour - if it exists remove it, otherwise add it
      let newOptimalHours: number[];
      
      if (currentCategorySettings.optimalHours.includes(hour)) {
        newOptimalHours = currentCategorySettings.optimalHours.filter((h: number) => h !== hour);
      } else {
        newOptimalHours = [...currentCategorySettings.optimalHours, hour];
      }
      
      console.log(`New optimal hours: ${newOptimalHours.join(', ')}`);
      
      // Update the settings with the new optimal hours
      return {
        ...prevSettings,
        [activeCategory]: {
          ...currentCategorySettings,
          optimalHours: newOptimalHours,
        },
      };
    });
  };
  
  // Handle preferred day toggle
  const handlePreferredDayToggle = (day: string) => {
    console.log(`Toggling preferred day: ${day}`);
    
    if (!activeCategory) return;
    
    setTimeSettings((prevSettings) => {
      const currentCategorySettings = { ...(prevSettings[activeCategory] || {
        startHour: 9,
        endHour: 17,
        optimalHours: [],
        preferredDays: []
      }) };
      
      // Toggle the day - if it exists remove it, otherwise add it
      let newPreferredDays: string[];
      
      if (currentCategorySettings.preferredDays.includes(day)) {
        newPreferredDays = currentCategorySettings.preferredDays.filter((d: string) => d !== day);
      } else {
        newPreferredDays = [...currentCategorySettings.preferredDays, day];
      }
      
      console.log(`New preferred days: ${newPreferredDays.join(', ')}`);
      
      // Update the settings with the new preferred days
      return {
        ...prevSettings,
        [activeCategory]: {
          ...currentCategorySettings,
          preferredDays: newPreferredDays,
        },
      };
    });
  };
  
  // Handle save settings
  const handleSave = () => {
    onSave(timeSettings);
    onOpenChange(false);
  };
  
  // Format hour display
  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour < 12 ? `${hour} AM` : `${hour-12} PM`;
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Smart Scheduling Settings</DialogTitle>
          <DialogDescription>
            Set preferred times for each event type to help AI schedule your calendar more efficiently.
          </DialogDescription>
        </DialogHeader>
        
        {/* Category selector */}
        <div className="mb-4">
          <Label htmlFor="category-select">Select Event Type</Label>
          <Select
            value={activeCategory || undefined}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger id="category-select" className="w-full">
              <SelectValue placeholder="Select event type" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.name} value={category.name}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ 
                        backgroundColor: getEventStyles(category.color).bg
                      }}
                    />
                    <span>{category.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {activeCategory && timeSettings[activeCategory] ? (
          <Tabs defaultValue="hours" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="hours">Daily Hours</TabsTrigger>
              <TabsTrigger value="days">Days of Week</TabsTrigger>
            </TabsList>
            
            <TabsContent value="hours" className="space-y-4">
              {/* Time range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-hour">Start Hour</Label>
                  <Select
                    value={timeSettings[activeCategory]?.startHour.toString()}
                    onValueChange={handleStartHourChange}
                  >
                    <SelectTrigger id="start-hour">
                      <SelectValue placeholder="Select start hour" />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS_IN_DAY.map((hour) => (
                        <SelectItem key={`start-${hour}`} value={hour.toString()}>
                          {formatHour(hour)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="end-hour">End Hour</Label>
                  <Select
                    value={timeSettings[activeCategory]?.endHour.toString()}
                    onValueChange={handleEndHourChange}
                  >
                    <SelectTrigger id="end-hour">
                      <SelectValue placeholder="Select end hour" />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS_IN_DAY.map((hour) => (
                        <SelectItem key={`end-${hour}`} value={hour.toString()}>
                          {formatHour(hour)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Optimal hours */}
              <div>
                <Label className="mb-2 block">Optimal Hours</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Select the best hours for this event type
                </p>
                <ScrollArea className="h-48 rounded-md border">
                  <div className="p-4 grid grid-cols-3 gap-2">
                    {optimalHours.map((item) => {
                      const isSelected = timeSettings[activeCategory]?.optimalHours.includes(item.hour);
                      return (
                        <Button
                          key={`optimal-${item.hour}`}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          className={cn(
                            "w-full transition-colors",
                            isSelected ? "" : "hover:bg-primary/10"
                          )}
                          onClick={() => handleOptimalHourToggle(item.hour)}
                        >
                          {formatHour(item.hour)}
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
            
            <TabsContent value="days" className="space-y-4">
              <Label className="mb-2 block">Preferred Days</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Select the most suitable days for this event type
              </p>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = timeSettings[activeCategory]?.preferredDays.includes(day.value);
                  return (
                    <Button
                      key={day.value}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className={cn(
                        "w-full transition-colors",
                        isSelected ? "" : "hover:bg-primary/10"
                      )}
                      onClick={() => handlePreferredDayToggle(day.value)}
                    >
                      {day.label}
                    </Button>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        ) : null}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 