'use client';

import type { WorkspaceCalendarGoogleToken } from '@tuturuuu/types/db';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Check, ExternalLink, Link, Loader2 } from 'lucide-react';
import { useState } from 'react';

export type SmartSchedulingData = {
  enableSmartScheduling: boolean;
  minimumMeetingBuffer: number; // in minutes
  preferredMeetingTimes: 'morning' | 'afternoon' | 'distributed';
  avoidBackToBackMeetings: boolean;
  maximumMeetingsPerDay: number;
  focusTimeBlocks: {
    enabled: boolean;
    duration: number; // in minutes
    frequency: 'daily' | 'weekly';
    preferredTime: 'morning' | 'afternoon';
  };
  productivityScore: number; // 0-100
};

export const defaultSmartSchedulingData: SmartSchedulingData = {
  enableSmartScheduling: true,
  minimumMeetingBuffer: 15,
  preferredMeetingTimes: 'afternoon',
  avoidBackToBackMeetings: true,
  maximumMeetingsPerDay: 5,
  focusTimeBlocks: {
    enabled: true,
    duration: 120,
    frequency: 'daily',
    preferredTime: 'morning',
  },
  productivityScore: 70,
};

type GoogleCalendarSettingsProps = {
  wsId: string;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken;
};

export function GoogleCalendarSettings({
  wsId,
  experimentalGoogleToken,
}: GoogleCalendarSettingsProps) {
  const [isGoogleAuthenticating, setIsGoogleAuthenticating] = useState(false);
  const { toast } = useToast();

  const handleGoogleAuth = async () => {
    if (!wsId) {
      toast({
        title: 'Error',
        description: 'Workspace ID is required to link Google Calendar',
        variant: 'destructive',
      });
      return;
    }

    setIsGoogleAuthenticating(true);
    try {
      const response = await fetch(`/api/v1/calendar/auth?wsId=${wsId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const { authUrl } = await response.json();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating Google auth:', error);
      toast({
        title: 'Error',
        description: 'Failed to initiate Google authentication',
        variant: 'destructive',
      });
      setIsGoogleAuthenticating(false);
    }
  };

  const openGoogleCalendarSettings = () => {
    window.open(
      'https://calendar.google.com/calendar/u/0/r/settings',
      '_blank'
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Google Calendar Integration</CardTitle>
              <CardDescription>
                Connect and sync with your Google Calendar
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col space-y-4">
            {experimentalGoogleToken ? (
              <div className="space-y-4">
                <div className="flex items-start rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                  <Check className="mt-0.5 mr-3 h-5 w-5 text-green-600 dark:text-green-400" />
                  <div>
                    <h4 className="font-medium text-green-800 dark:text-green-300">
                      Connected to Google Calendar
                    </h4>
                    <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                      Your calendar is syncing with Google Calendar
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={openGoogleCalendarSettings}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Google Calendar Settings
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 border-destructive text-destructive hover:bg-destructive/10"
                  >
                    <Link className="h-4 w-4" />
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert variant="default" className="bg-muted">
                  <AlertDescription>
                    Link your Google Calendar to automatically sync events and
                    use smart scheduling features.
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={handleGoogleAuth}
                  disabled={isGoogleAuthenticating}
                  className="flex items-center gap-2"
                >
                  {isGoogleAuthenticating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Link className="h-4 w-4" />
                      <span>Connect Google Calendar</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
