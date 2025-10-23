'use client';

import { Calendar, Clock, Settings } from '@tuturuuu/icons';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { useState } from 'react';

export default function TimeTrackerSettingsPage() {
  const [heatmapSettings, setHeatmapSettings] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('heatmap-settings');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // Fall through to default
        }
      }
    }
    return {
      viewMode: 'original' as 'original' | 'hybrid' | 'calendar-only',
      timeReference: 'smart' as 'relative' | 'absolute' | 'smart',
      showOnboardingTips: true,
    };
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-gray-500 to-gray-700 shadow-lg">
            <Settings className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg sm:text-xl">Timer Settings</CardTitle>
            <CardDescription>
              Customize your tracking experience ⚙️
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Activity Heatmap Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium">Activity Heatmap Display</h4>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="heatmap-view">Heatmap View Style</Label>
                <Select
                  value={heatmapSettings.viewMode}
                  onValueChange={(
                    value: 'original' | 'hybrid' | 'calendar-only'
                  ) => {
                    const newSettings = {
                      ...heatmapSettings,
                      viewMode: value,
                    };
                    setHeatmapSettings(newSettings);
                    localStorage.setItem(
                      'heatmap-settings',
                      JSON.stringify(newSettings)
                    );
                  }}
                >
                  <SelectTrigger id="heatmap-view">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-sm bg-blue-500" />
                        <span>Original Grid</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="hybrid">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-sm bg-green-500" />
                        <span>Hybrid (Year + Calendar)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="calendar-only">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-sm bg-purple-500" />
                        <span>Calendar Only</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="compact-cards">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-sm bg-orange-500" />
                        <span>Compact Cards</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  {heatmapSettings.viewMode === 'original' &&
                    'GitHub-style grid view with day labels'}
                  {heatmapSettings.viewMode === 'hybrid' &&
                    'Year overview plus monthly calendar details'}
                  {heatmapSettings.viewMode === 'calendar-only' &&
                    'Traditional calendar interface'}
                  {heatmapSettings.viewMode === 'compact-cards' &&
                    'Monthly summary cards with key metrics and mini previews'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time-reference">Time Reference</Label>
                <Select
                  value={heatmapSettings.timeReference}
                  onValueChange={(value: 'relative' | 'absolute' | 'smart') => {
                    const newSettings = {
                      ...heatmapSettings,
                      timeReference: value,
                    };
                    setHeatmapSettings(newSettings);
                    localStorage.setItem(
                      'heatmap-settings',
                      JSON.stringify(newSettings)
                    );
                  }}
                >
                  <SelectTrigger id="time-reference">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relative">
                      Relative ("2 weeks ago")
                    </SelectItem>
                    <SelectItem value="absolute">
                      Absolute ("Jan 15, 2024")
                    </SelectItem>
                    <SelectItem value="smart">Smart (Both combined)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="onboarding-tips"
                  checked={heatmapSettings.showOnboardingTips}
                  onCheckedChange={(checked) => {
                    const newSettings = {
                      ...heatmapSettings,
                      showOnboardingTips: checked,
                    };
                    setHeatmapSettings(newSettings);
                    localStorage.setItem(
                      'heatmap-settings',
                      JSON.stringify(newSettings)
                    );
                  }}
                />
                <Label htmlFor="onboarding-tips" className="text-sm">
                  Show onboarding tips
                </Label>
              </div>
            </div>
          </div>

          {/* Coming Soon Section */}
          <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed p-4">
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-muted-foreground">
                More Settings Coming Soon
              </h4>
            </div>
            <p className="text-muted-foreground text-xs">
              Notifications, default categories, productivity goals, and more
              customization options.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
