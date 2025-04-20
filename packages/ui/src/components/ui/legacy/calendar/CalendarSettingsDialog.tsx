'use client';

import { AppearanceSettings } from './settings/AppearanceSettings';
import {
  CalendarSettings,
  CalendarSettingsProvider,
  useCalendarSettings,
} from './settings/CalendarSettingsContext';
import { CategoryColorsSettings } from './settings/CategoryColorsSettings';
import { HoursSettings } from './settings/HoursSettings';
import { NotificationSettings } from './settings/NotificationSettings';
import { SmartSchedulingSettings } from './settings/SmartSchedulingSettings';
import { TaskSettings } from './settings/TaskSettings';
import { TimezoneSettings } from './settings/TimezoneSettings';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@tuturuuu/ui/sidebar';
import { cn } from '@tuturuuu/utils/format';
import { Clock, Paintbrush, Palette } from 'lucide-react';
import * as React from 'react';

type SettingsSection = {
  id: keyof CalendarSettings | 'hours' | 'advanced';
  name: string;
  icon: React.ElementType;
  description: string;
};

const settingsSections: SettingsSection[] = [
  {
    id: 'hours',
    name: 'Hours',
    icon: Clock,
    description: 'Configure your work, meeting, and personal hours',
  },
  {
    id: 'categoryColors',
    name: 'Category Colors',
    icon: Palette,
    description: 'Customize colors for different event categories',
  },
  // {
  //   id: 'smartScheduling',
  //   name: 'Smart Scheduling',
  //   icon: Sparkles,
  //   description: 'Configure AI-powered scheduling preferences',
  // },
  // {
  //   id: 'taskSettings',
  //   name: 'Task Settings',
  //   icon: ListTodo,
  //   description: 'Manage task types and scheduling behavior',
  // },
  {
    id: 'appearance',
    name: 'Appearance',
    icon: Paintbrush,
    description: 'Customize the look and feel of your calendar',
  },
];

// Content for each settings section
const SettingsContent = ({
  section,
}: {
  section: keyof CalendarSettings | 'hours' | 'advanced';
}) => {
  const { settings, updateSettings } = useCalendarSettings();

  switch (section) {
    case 'timezone':
      return (
        <TimezoneSettings
          value={settings.timezone}
          onChange={(value) => updateSettings('timezone', value)}
        />
      );
    case 'hours':
      return (
        <HoursSettings
          value={{
            personalHours: settings.personalHours,
            workHours: settings.workHours,
            meetingHours: settings.meetingHours,
          }}
          onChange={(value) => {
            updateSettings('personalHours', value.personalHours);
            updateSettings('workHours', value.workHours);
            updateSettings('meetingHours', value.meetingHours);
          }}
        />
      );
    case 'categoryColors':
      return (
        <CategoryColorsSettings
          value={settings.categoryColors}
          onChange={(value) => updateSettings('categoryColors', value)}
        />
      );
    case 'smartScheduling':
      return (
        <SmartSchedulingSettings
          value={settings.smartScheduling}
          onChange={(value) => updateSettings('smartScheduling', value)}
        />
      );
    case 'taskSettings':
      return (
        <TaskSettings
          value={settings.taskSettings}
          onChange={(value) => updateSettings('taskSettings', value)}
        />
      );
    case 'notifications':
      return (
        <NotificationSettings
          value={settings.notifications}
          onChange={(value) => updateSettings('notifications', value)}
        />
      );
    case 'appearance':
      return (
        <AppearanceSettings
          value={settings.appearance}
          onChange={(value) => updateSettings('appearance', value)}
        />
      );
    default:
      return <div>Select a setting from the sidebar</div>;
  }
};

// Dialog content with settings
function SettingsDialogContent({
  onClose,
}: {
  onClose: (save?: boolean) => void;
}) {
  const [activeSection, setActiveSection] = React.useState<
    keyof CalendarSettings | 'hours' | 'advanced'
  >('hours');
  const { hasChanges, saveSettings, resetSettings } = useCalendarSettings();

  const handleSave = async () => {
    try {
      await saveSettings();
      onClose(true);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleCancel = () => {
    resetSettings();
    onClose(false);
  };

  return (
    <SidebarProvider className="items-start">
      {/* Desktop Sidebar */}
      <Sidebar collapsible="none" className="hidden border-r md:flex">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsSections.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.id === activeSection}
                      onClick={() => setActiveSection(item.id)}
                    >
                      <a href="#" className="group">
                        <item.icon className="h-5 w-5" />
                        <div className="flex flex-col">
                          <span>{item.name}</span>
                        </div>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <main className="flex h-[calc(100vh-5.75rem)] flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear">
          {/* Mobile dropdown */}
          <div className="w-full md:hidden">
            <Select
              value={activeSection as string}
              onValueChange={(value) => setActiveSection(value as any)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a setting" />
              </SelectTrigger>
              <SelectContent>
                {settingsSections.map((item) => (
                  <SelectItem key={item.id} value={item.id as string}>
                    <div className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop breadcrumb */}
          <div className="hidden items-center gap-2 md:flex">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Calendar Settings</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {settingsSections.find((s) => s.id === activeSection)
                      ?.name || activeSection}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
          <SettingsContent section={activeSection} />
        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges}
            className={cn(
              hasChanges && 'bg-primary/90 hover:bg-primary animate-pulse'
            )}
          >
            Save Changes
          </Button>
        </div>
      </main>
    </SidebarProvider>
  );
}

export function CalendarSettingsDialog({
  open,
  onOpenChange,
  initialSettings,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSettings?: Partial<CalendarSettings>;
  onSave?: (settings: CalendarSettings) => Promise<void>;
}) {
  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-hidden p-0 md:max-w-[900px]">
        <DialogTitle className="sr-only">Calendar Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Customize your calendar settings here.
        </DialogDescription>
        <CalendarSettingsProvider
          initialSettings={initialSettings}
          onSave={onSave}
        >
          <SettingsDialogContent onClose={handleClose} />
        </CalendarSettingsProvider>
      </DialogContent>
    </Dialog>
  );
}
