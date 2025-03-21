'use client';

import { TimeRangePicker, WeekTimeRanges } from './TimeRangePicker';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Briefcase, Calendar, Clock, User } from 'lucide-react';
import { useState } from 'react';

export type HoursSettingsData = {
  personalHours: WeekTimeRanges;
  workHours: WeekTimeRanges;
  meetingHours: WeekTimeRanges;
};

type HoursSettingsProps = {
  value: HoursSettingsData;
  onChange: (value: HoursSettingsData) => void;
};

export function HoursSettings({ value, onChange }: HoursSettingsProps) {
  const [activeTab, setActiveTab] = useState<'work' | 'meeting' | 'personal'>(
    'work'
  );

  const handlePersonalHoursChange = (newHours: WeekTimeRanges) => {
    onChange({
      ...value,
      personalHours: newHours,
    });
  };

  const handleWorkHoursChange = (newHours: WeekTimeRanges) => {
    onChange({
      ...value,
      workHours: newHours,
    });
  };

  const handleMeetingHoursChange = (newHours: WeekTimeRanges) => {
    onChange({
      ...value,
      meetingHours: newHours,
    });
  };

  // Helper to get a summary of active days
  const getActiveDaysSummary = (hours: WeekTimeRanges): string => {
    const days = Object.entries(hours)
      .filter(([_, value]) => value.enabled)
      .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1, 3));

    if (days.length === 7) return 'All days';
    if (days.length === 0) return 'No days';
    if (days.length <= 3) return days.join(', ');
    return `${days.length} days`;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md bg-muted/30 p-4">
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p>
              Configure your available hours for different activities. These
              settings help the calendar optimize scheduling and provide better
              suggestions.
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="mb-4 flex items-center justify-between">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="work" className="flex items-center gap-1">
              <Briefcase className="h-4 w-4" />
              <span>Work Hours</span>
            </TabsTrigger>
            <TabsTrigger value="meeting" className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Meeting Hours</span>
            </TabsTrigger>
            <TabsTrigger value="personal" className="flex items-center gap-1">
              <User className="h-4 w-4" />
              <span>Personal Hours</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Work Hours Tab */}
        <TabsContent value="work" className="mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <Briefcase className="h-4 w-4" />
                  Work Hours
                </CardTitle>
                <Badge variant="outline" className="text-xs font-normal">
                  {getActiveDaysSummary(value.workHours)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <TimeRangePicker
                label=""
                value={value.workHours}
                onChange={handleWorkHoursChange}
                showDaySelector={true}
                compact={false}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Meeting Hours Tab */}
        <TabsContent value="meeting" className="mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <Calendar className="h-4 w-4" />
                  Meeting Hours
                </CardTitle>
                <Badge variant="outline" className="text-xs font-normal">
                  {getActiveDaysSummary(value.meetingHours)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <TimeRangePicker
                label=""
                value={value.meetingHours}
                onChange={handleMeetingHoursChange}
                showDaySelector={true}
                compact={false}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personal Hours Tab */}
        <TabsContent value="personal" className="mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <User className="h-4 w-4" />
                  Personal Hours
                </CardTitle>
                <Badge variant="outline" className="text-xs font-normal">
                  {getActiveDaysSummary(value.personalHours)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <TimeRangePicker
                label=""
                value={value.personalHours}
                onChange={handlePersonalHoursChange}
                showDaySelector={true}
                compact={false}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
