'use client';

import { TimeRangePicker, WeekTimeRanges } from './TimeRangePicker';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Briefcase, Calendar, Clock, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export type HoursSettingsData = {
  personalHours: WeekTimeRanges;
  workHours: WeekTimeRanges;
  meetingHours: WeekTimeRanges;
};

type HoursSettingsProps = {
  wsId: string;
};

export function HoursSettings({ wsId }: HoursSettingsProps) {
  const [value, setValue] = useState<{
    personalHours?: WeekTimeRanges | null;
    workHours?: WeekTimeRanges | null;
    meetingHours?: WeekTimeRanges | null;
  } | null>(null);

  useEffect(() => {
    const fetchHours = async () => {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('workspace_calendar_hour_settings')
        .select('*')
        .eq('ws_id', wsId);

      if (error) {
        console.error(error);
        return;
      }

      setValue({
        personalHours: data?.find((h) => h.type === 'PERSONAL')
          ?.data as WeekTimeRanges | null,
        workHours: data?.find((h) => h.type === 'WORK')
          ?.data as WeekTimeRanges | null,
        meetingHours: data?.find((h) => h.type === 'MEETING')
          ?.data as WeekTimeRanges | null,
      });
    };

    fetchHours();
  }, []);

  const [activeTab, setActiveTab] = useState<'work' | 'meeting' | 'personal'>(
    'work'
  );

  const handlePersonalHoursChange = async (
    newHours?: WeekTimeRanges | null
  ) => {
    if (!newHours) {
      toast.error('No hours provided');
      return;
    }

    setValue((prev) => ({
      ...prev,
      personalHours: newHours,
    }));

    const supabase = createClient();

    const { error } = await supabase
      .from('workspace_calendar_hour_settings')
      .upsert({
        data: newHours,
        type: 'PERSONAL',
        ws_id: wsId,
      })
      .eq('ws_id', wsId);

    if (error) {
      console.error(error);
      return;
    }

    toast.success('Personal hours updated');
  };

  const handleWorkHoursChange = async (newHours?: WeekTimeRanges | null) => {
    if (!newHours) {
      toast.error('No hours provided');
      return;
    }

    setValue((prev) => ({
      ...prev,
      workHours: newHours,
    }));

    const supabase = createClient();

    const { error } = await supabase
      .from('workspace_calendar_hour_settings')
      .upsert({
        data: newHours,
        type: 'WORK',
        ws_id: wsId,
      });

    if (error) {
      console.error(error);
      return;
    }

    toast.success('Work hours updated');
  };

  const handleMeetingHoursChange = async (newHours?: WeekTimeRanges | null) => {
    if (!newHours) {
      toast.error('No hours provided');
      return;
    }

    setValue((prev) => ({
      ...prev,
      meetingHours: newHours,
    }));

    const supabase = createClient();

    const { error } = await supabase
      .from('workspace_calendar_hour_settings')
      .upsert({
        data: newHours,
        type: 'MEETING',
        ws_id: wsId,
      });

    if (error) {
      console.error(error);
      return;
    }

    toast.success('Meeting hours updated');
  };

  // Helper to get a summary of active days
  const getActiveDaysSummary = (hours?: WeekTimeRanges | null): string => {
    if (!hours) return 'No days';

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
      <div className="bg-muted/30 rounded-md p-4">
        <div className="flex items-start gap-2">
          <Clock className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="text-muted-foreground text-sm">
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
                  {getActiveDaysSummary(value?.workHours)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <TimeRangePicker
                label=""
                value={value?.workHours}
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
                  {getActiveDaysSummary(value?.meetingHours)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <TimeRangePicker
                label=""
                value={value?.meetingHours}
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
                  {getActiveDaysSummary(value?.personalHours)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <TimeRangePicker
                label=""
                value={value?.personalHours}
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
