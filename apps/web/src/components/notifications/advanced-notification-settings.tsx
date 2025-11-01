'use client';

import { Clock, Moon } from '@tuturuuu/icons';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Label } from '@tuturuuu/ui/label';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import type { DigestFrequency } from '@/hooks/useAccountNotificationPreferences';

interface AdvancedNotificationSettingsProps {
  digestFrequency?: DigestFrequency;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone?: string;
  onUpdate: (settings: {
    digestFrequency?: DigestFrequency;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    timezone?: string;
  }) => Promise<void>;
}

export default function AdvancedNotificationSettings({
  digestFrequency: initialDigestFrequency = 'immediate',
  quietHoursStart: initialQuietStart,
  quietHoursEnd: initialQuietEnd,
  timezone: initialTimezone = 'UTC',
  onUpdate,
}: AdvancedNotificationSettingsProps) {
  const t = useTranslations('notifications.settings.advanced');
  const tCommon = useTranslations('common');

  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>(
    initialDigestFrequency
  );
  const [quietHoursStart, setQuietHoursStart] = useState(
    initialQuietStart || ''
  );
  const [quietHoursEnd, setQuietHoursEnd] = useState(initialQuietEnd || '');
  const [timezone, setTimezone] = useState(initialTimezone);
  const [isSaving, setIsSaving] = useState(false);

  // Detect user's timezone
  useEffect(() => {
    if (!initialTimezone || initialTimezone === 'UTC') {
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(detectedTimezone);
    }
  }, []);

  const handleDigestFrequencyChange = async (value: DigestFrequency) => {
    setDigestFrequency(value);
    setIsSaving(true);

    try {
      await onUpdate({
        digestFrequency: value,
        quietHoursStart: quietHoursStart || undefined,
        quietHoursEnd: quietHoursEnd || undefined,
        timezone,
      });
      toast.success(t('digest-updated'));
    } catch (error) {
      toast.error(t('update-failed'));
      console.error('Error updating digest frequency:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuietHoursChange = async () => {
    if (!quietHoursStart || !quietHoursEnd) return;

    setIsSaving(true);

    try {
      await onUpdate({
        digestFrequency,
        quietHoursStart,
        quietHoursEnd,
        timezone,
      });
      toast.success(t('quiet-hours-updated'));
    } catch (error) {
      toast.error(t('update-failed'));
      console.error('Error updating quiet hours:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuietHoursStartChange = (value: string) => {
    setQuietHoursStart(value);
  };

  const handleQuietHoursEndChange = (value: string) => {
    setQuietHoursEnd(value);
  };

  // Trigger update when quiet hours are fully set
  useEffect(() => {
    if (quietHoursStart && quietHoursEnd) {
      const timer = setTimeout(() => {
        handleQuietHoursChange();
      }, 1000); // Debounce for 1 second

      return () => clearTimeout(timer);
    }
  }, [quietHoursStart, quietHoursEnd]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Digest Frequency */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-dynamic-purple/20 p-2">
              <Clock className="h-5 w-5 text-dynamic-purple" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('digest-frequency')}</CardTitle>
              <CardDescription>{t('digest-description')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="digest-frequency">{t('frequency')}</Label>
            <Select
              value={digestFrequency}
              onValueChange={(value) =>
                handleDigestFrequencyChange(value as DigestFrequency)
              }
              disabled={isSaving}
            >
              <SelectTrigger id="digest-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">
                  {t('frequency-immediate')}
                </SelectItem>
                <SelectItem value="hourly">{t('frequency-hourly')}</SelectItem>
                <SelectItem value="daily">{t('frequency-daily')}</SelectItem>
                <SelectItem value="weekly">{t('frequency-weekly')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t('digest-frequency-help')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-dynamic-indigo/20 p-2">
              <Moon className="h-5 w-5 text-dynamic-indigo" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('quiet-hours')}</CardTitle>
              <CardDescription>{t('quiet-hours-description')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quiet-start">{t('start-time')}</Label>
                <Input
                  id="quiet-start"
                  type="time"
                  value={quietHoursStart}
                  onChange={(e) => handleQuietHoursStartChange(e.target.value)}
                  disabled={isSaving}
                  aria-label={t('quiet-hours-start')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiet-end">{t('end-time')}</Label>
                <Input
                  id="quiet-end"
                  type="time"
                  value={quietHoursEnd}
                  onChange={(e) => handleQuietHoursEndChange(e.target.value)}
                  disabled={isSaving}
                  aria-label={t('quiet-hours-end')}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">{t('timezone')}</Label>
              <Input
                id="timezone"
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled
                className="bg-muted"
                aria-label={t('timezone')}
              />
              <p className="text-muted-foreground text-xs">
                {t('quiet-hours-help')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
