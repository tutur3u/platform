'use client';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Bell, Cog, Palette, Shield, Users } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function TimeTrackerSettingsPage() {
  const params = useParams();
  const wsId = params.wsId as string;
  const [settings, setSettings] = useState({
    defaultProject: 'general',
    workHours: 8,
    breakDuration: 15,
    timezone: 'utc',
    autoStartTimer: true,
    showBreakReminders: true,
    roundTime: false,
    breakNotifications: true,
    dailySummaryEmails: false,
    weeklyReportNotifications: true,
    idleTimeWarnings: true,
    shareWithTeam: true,
    autoSyncCalendar: false,
    dataRetention: 12,
    teamTimeTracking: true,
    projectTimeLimits: false,
    approvalWorkflow: false,
    theme: 'system',
    accentColor: 'blue',
    compactMode: false,
  });

  // Fetch real settings data
  const { data: settingsData } = useQuery({
    queryKey: ['time-tracking-settings', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/settings`
      );
      if (!response.ok) throw new Error('Failed to fetch settings');
      return response.json();
    },
  });

  // Fetch available projects
  const { data: projectsData } = useQuery({
    queryKey: ['time-tracking-projects', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/projects`
      );
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    },
  });

  // Update settings when data is loaded
  useEffect(() => {
    if (settingsData?.settings) {
      setSettings((prev) => ({ ...prev, ...settingsData.settings }));
    }
  }, [settingsData?.settings]);

  const handleSettingChange = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/settings`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        }
      );
      if (!response.ok) throw new Error('Failed to save settings');
      // Show success message
    } catch (error) {
      // Show error message
    }
  };

  const handleReset = () => {
    if (settingsData?.settings) {
      setSettings((prev) => ({ ...prev, ...settingsData.settings }));
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <Cog className="h-6 w-6 text-primary" />
        <h1 className="font-bold text-2xl">Time Tracker Settings</h1>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cog className="h-5 w-5" />
            General Settings
          </CardTitle>
          <CardDescription>Basic time tracker configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="default-project">Default Project</Label>
              <Select
                value={settings.defaultProject}
                onValueChange={(value) =>
                  handleSettingChange('defaultProject', value)
                }
              >
                <SelectTrigger id="default-project">
                  <SelectValue placeholder="Select default project" />
                </SelectTrigger>
                <SelectContent>
                  {projectsData?.projects?.map((project: any) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  )) || (
                    <>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="design">Design</SelectItem>
                      <SelectItem value="research">Research</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-hours">Daily Work Hours</Label>
              <Input
                id="work-hours"
                type="number"
                value={settings.workHours}
                onChange={(e) =>
                  handleSettingChange('workHours', parseFloat(e.target.value))
                }
                min="1"
                max="24"
                step="0.5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="break-duration">Break Duration (minutes)</Label>
              <Input
                id="break-duration"
                type="number"
                value={settings.breakDuration}
                onChange={(e) =>
                  handleSettingChange('breakDuration', parseInt(e.target.value))
                }
                min="5"
                max="60"
                step="5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={settings.timezone}
                onValueChange={(value) =>
                  handleSettingChange('timezone', value)
                }
              >
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="utc">UTC</SelectItem>
                  <SelectItem value="est">Eastern Time</SelectItem>
                  <SelectItem value="pst">Pacific Time</SelectItem>
                  <SelectItem value="gmt">GMT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-start timer on task selection</Label>
                <p className="text-muted-foreground text-sm">
                  Automatically start the timer when selecting a task
                </p>
              </div>
              <Switch
                checked={settings.autoStartTimer}
                onCheckedChange={(checked) =>
                  handleSettingChange('autoStartTimer', checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Show break reminders</Label>
                <p className="text-muted-foreground text-sm">
                  Get notified when it's time to take a break
                </p>
              </div>
              <Switch
                checked={settings.showBreakReminders}
                onCheckedChange={(checked) =>
                  handleSettingChange('showBreakReminders', checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Round time to nearest minute</Label>
                <p className="text-muted-foreground text-sm">
                  Automatically round tracked time to the nearest minute
                </p>
              </div>
              <Switch
                checked={settings.roundTime}
                onCheckedChange={(checked) =>
                  handleSettingChange('roundTime', checked)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>
            Configure how you receive time tracking notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Break time notifications</Label>
              <p className="text-muted-foreground text-sm">
                Get notified when it's time to take scheduled breaks
              </p>
            </div>
            <Switch
              checked={settings.breakNotifications}
              onCheckedChange={(checked) =>
                handleSettingChange('breakNotifications', checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Daily summary emails</Label>
              <p className="text-muted-foreground text-sm">
                Receive daily summary of your time tracking
              </p>
            </div>
            <Switch
              checked={settings.dailySummaryEmails}
              onCheckedChange={(checked) =>
                handleSettingChange('dailySummaryEmails', checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Weekly report notifications</Label>
              <p className="text-muted-foreground text-sm">
                Get notified when weekly reports are ready
              </p>
            </div>
            <Switch
              checked={settings.weeklyReportNotifications}
              onCheckedChange={(checked) =>
                handleSettingChange('weeklyReportNotifications', checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Idle time warnings</Label>
              <p className="text-muted-foreground text-sm">
                Warn when timer has been idle for too long
              </p>
            </div>
            <Switch
              checked={settings.idleTimeWarnings}
              onCheckedChange={(checked) =>
                handleSettingChange('idleTimeWarnings', checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Privacy & Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy & Security
          </CardTitle>
          <CardDescription>
            Control your data privacy and security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Share time data with team</Label>
              <p className="text-muted-foreground text-sm">
                Allow team members to see your time tracking data
              </p>
            </div>
            <Switch
              checked={settings.shareWithTeam}
              onCheckedChange={(checked) =>
                handleSettingChange('shareWithTeam', checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-sync with calendar</Label>
              <p className="text-muted-foreground text-sm">
                Automatically sync tracked time with your calendar
              </p>
            </div>
            <Switch
              checked={settings.autoSyncCalendar}
              onCheckedChange={(checked) =>
                handleSettingChange('autoSyncCalendar', checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Data retention (months)</Label>
              <p className="text-muted-foreground text-sm">
                How long to keep your time tracking data
              </p>
            </div>
            <Select
              value={settings.dataRetention.toString()}
              onValueChange={(value) =>
                handleSettingChange('dataRetention', parseInt(value))
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 months</SelectItem>
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Team Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Settings
          </CardTitle>
          <CardDescription>
            Configure team-wide time tracking settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Team time tracking</Label>
              <p className="text-muted-foreground text-sm">
                Enable time tracking for all team members
              </p>
            </div>
            <Switch
              checked={settings.teamTimeTracking}
              onCheckedChange={(checked) =>
                handleSettingChange('teamTimeTracking', checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Project time limits</Label>
              <p className="text-muted-foreground text-sm">
                Set maximum time limits for projects
              </p>
            </div>
            <Switch
              checked={settings.projectTimeLimits}
              onCheckedChange={(checked) =>
                handleSettingChange('projectTimeLimits', checked)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Approval workflow</Label>
              <p className="text-muted-foreground text-sm">
                Require approval for time entries over 8 hours
              </p>
            </div>
            <Switch
              checked={settings.approvalWorkflow}
              onCheckedChange={(checked) =>
                handleSettingChange('approvalWorkflow', checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>
            Customize the look and feel of your time tracker
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              <Select
                value={settings.theme}
                onValueChange={(value) => handleSettingChange('theme', value)}
              >
                <SelectTrigger id="theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accent-color">Accent Color</Label>
              <Select
                value={settings.accentColor}
                onValueChange={(value) =>
                  handleSettingChange('accentColor', value)
                }
              >
                <SelectTrigger id="accent-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blue">Blue</SelectItem>
                  <SelectItem value="green">Green</SelectItem>
                  <SelectItem value="purple">Purple</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Compact mode</Label>
              <p className="text-muted-foreground text-sm">
                Use a more compact layout for the interface
              </p>
            </div>
            <Switch
              checked={settings.compactMode}
              onCheckedChange={(checked) =>
                handleSettingChange('compactMode', checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
        <Button onClick={handleSave}>Save Settings</Button>
      </div>
    </div>
  );
}
