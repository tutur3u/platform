import {
  type TimeValidationResult,
  useMissedEntryForm,
  useWorkspaceTimeThreshold,
} from '@tuturuuu/hooks';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { createAuthorizedFetcher } from '@/lib/api/fetcher';
import { apiConfig } from '@/lib/config/api';
import { useAuthStore } from '@/lib/stores/auth-store';

interface MissedEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  apiBaseUrl?: string;
  canSkipProof?: boolean;
}

// Simple validation error message mapper for native
function getValidationErrorMessage(result: TimeValidationResult): string {
  if (!result.errorCode) return '';

  const messages: Record<string, string> = {
    INVALID_DATE_TIME: 'Invalid date/time format',
    FUTURE_DATE_TIME: 'Date/time cannot be in the future',
    FUTURE_START_TIME: 'Start time cannot be in the future',
    FUTURE_END_TIME: 'End time cannot be in the future',
    END_BEFORE_START: 'End time must be after start time',
    DURATION_TOO_SHORT: 'Duration must be at least 1 minute',
    FUTURE_ENTRY_DATE: 'Entry date cannot be in the future',
    REQUIRES_APPROVAL: `Entries older than ${result.errorParams?.days} day(s) require approval`,
    ALL_EDITS_REQUIRE_APPROVAL: 'All edits require approval',
    SESSION_TOO_OLD_TO_EDIT: `Session is too old to edit (threshold: ${result.errorParams?.days} days)`,
    START_TIME_TOO_OLD: `Start time is too old (threshold: ${result.errorParams?.days} days)`,
    FUTURE_SESSION_UPDATE: 'Session update time cannot be in the future',
  };

  return messages[result.errorCode] || 'Validation error';
}

export function MissedEntryDialog({
  open,
  onOpenChange,
  wsId,
  apiBaseUrl = '/api/v1/workspaces',
  canSkipProof = false,
}: MissedEntryDialogProps) {
  // Get auth token for authorized fetcher
  const session = useAuthStore((state) => state.session);
  const accessToken = session?.access_token;

  // Create authorized fetcher with auth token
  const authorizedFetcher = useMemo(
    () => createAuthorizedFetcher(accessToken),
    [accessToken]
  );

  // Fetch workspace threshold setting with authorized fetcher
  console.log('Fetching workspace time threshold for wsId:', wsId);
  const {
    data: thresholdData,
    isLoading: isLoadingThreshold,
    isError: isErrorThreshold,
  } = useWorkspaceTimeThreshold(open ? wsId : null, {
    fetcher: authorizedFetcher,
    baseUrl: apiConfig.baseUrl,
  });
  console.log('Threshold data:', thresholdData);

  const thresholdDays = thresholdData?.threshold;
  console.log('Workspace missed entry threshold days:', thresholdDays);

  const form = useMissedEntryForm(
    open,
    {
      wsId,
      mode: 'normal',
      allowFutureSessions: false,
    },
    {
      onOpenChange,
      onSuccess: (message) => {
        Alert.alert('Success', message);
      },
      onError: (message) => {
        Alert.alert('Error', message);
      },
      refreshData: () => {
        // Refresh logic handled by React Query invalidation in the hook
      },
      getValidationErrorMessage,
    }
  );

  // Check if start time is older than threshold
  const isStartTimeOlderThanThreshold = useMemo(() => {
    if (!form.missedEntryStartTime) return false;
    if (isLoadingThreshold || isErrorThreshold) return true;
    if (thresholdDays === null || thresholdDays === undefined) return false;
    if (thresholdDays === 0) return true;

    const startTime = dayjs(form.missedEntryStartTime);
    const thresholdAgo = dayjs().subtract(thresholdDays, 'day');
    return startTime.isBefore(thresholdAgo);
  }, [
    form.missedEntryStartTime,
    thresholdDays,
    isLoadingThreshold,
    isErrorThreshold,
  ]);

  // Users with manage permission can skip proof/approval for old entries
  const effectiveIsOlderThanThreshold = canSkipProof
    ? false
    : isStartTimeOlderThanThreshold;

  console.log('effectiveIsOlderThanThreshold:', effectiveIsOlderThanThreshold);

  const hasValidationErrors = Object.keys(form.validationErrors).length > 0;
  const isLoading = form.isCreatingMissedEntry || form.isDiscarding;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Missed Entry</DialogTitle>
          <DialogDescription>
            Create a time tracking entry for work you've already completed
          </DialogDescription>
        </DialogHeader>

        <ScrollView className="max-h-[500px]">
          <View className="gap-4 p-1">
            {/* Title */}
            <View>
              <Label nativeID="title">Title *</Label>
              <Input
                aria-labelledby="title"
                value={form.missedEntryTitle}
                onChangeText={form.setMissedEntryTitle}
                placeholder="Enter title"
                editable={!isLoading}
              />
            </View>

            {/* Description */}
            <View>
              <Label nativeID="description">Description</Label>
              <Textarea
                aria-labelledby="description"
                value={form.missedEntryDescription}
                onChangeText={form.setMissedEntryDescription}
                placeholder="Enter description (optional)"
                editable={!isLoading}
                numberOfLines={3}
              />
            </View>

            {/* Start Time */}
            <View>
              <Label nativeID="startTime">Start Time *</Label>
              <Input
                aria-labelledby="startTime"
                value={form.missedEntryStartTime}
                onChangeText={form.setMissedEntryStartTime}
                placeholder="YYYY-MM-DD HH:MM"
                editable={!isLoading}
              />
              {form.validationErrors.startTime && (
                <Text className="mt-1 text-destructive text-sm">
                  {form.validationErrors.startTime}
                </Text>
              )}
            </View>

            {/* End Time */}
            <View>
              <Label nativeID="endTime">End Time *</Label>
              <Input
                aria-labelledby="endTime"
                value={form.missedEntryEndTime}
                onChangeText={form.setMissedEntryEndTime}
                placeholder="YYYY-MM-DD HH:MM"
                editable={!isLoading}
              />
              {form.validationErrors.endTime && (
                <Text className="mt-1 text-destructive text-sm">
                  {form.validationErrors.endTime}
                </Text>
              )}
              {form.validationErrors.timeRange && (
                <Text className="mt-1 text-destructive text-sm">
                  {form.validationErrors.timeRange}
                </Text>
              )}
            </View>

            {/* Duration Display */}
            {form.missedEntryStartTime && form.missedEntryEndTime && (
              <View className="rounded-lg bg-muted p-3">
                <Text className="text-muted-foreground text-sm">
                  Duration: {(() => {
                    const start = new Date(form.missedEntryStartTime);
                    const end = new Date(form.missedEntryEndTime);
                    const diffMs = end.getTime() - start.getTime();
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor(
                      (diffMs % (1000 * 60 * 60)) / (1000 * 60)
                    );
                    return `${hours}h ${minutes}m`;
                  })()}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        <DialogFooter>
          <Button
            variant="outline"
            onPress={() => form.closeMissedEntryDialog()}
            disabled={isLoading}
          >
            <Text>Cancel</Text>
          </Button>
          <Button
            onPress={() =>
              form.createMissedEntry(
                effectiveIsOlderThanThreshold,
                thresholdDays,
                apiBaseUrl
              )
            }
            disabled={
              isLoading ||
              !form.missedEntryTitle.trim() ||
              !form.missedEntryStartTime ||
              !form.missedEntryEndTime ||
              hasValidationErrors
            }
          >
            <Text>{isLoading ? 'Creating...' : 'Create Entry'}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
