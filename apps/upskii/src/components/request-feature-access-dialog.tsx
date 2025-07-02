'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { CheckCircle, Clock, Loader2, Send, XCircle } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  FEATURE_FLAG_TO_REQUESTABLE_KEY,
  getRequestableFeature,
  getRequestableFeatureKeys,
  type RequestableFeatureKey,
} from '@tuturuuu/utils/feature-flags/requestable-features';
import type { FeatureFlag } from '@tuturuuu/utils/feature-flags/types';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface RequestFeatureAccessDialogProps {
  workspaceName: string | null;
  wsId: string;
  children: React.ReactNode;
  enabledFeatures?: Record<FeatureFlag, boolean>;
}

interface FeatureAccessRequest {
  id: string;
  feature: string;
  status: 'pending' | 'approved' | 'rejected';
  message: string;
  admin_notes?: string;
  created_at: string;
}

export function RequestFeatureAccessDialog({
  workspaceName,
  wsId,
  children,
  enabledFeatures,
}: RequestFeatureAccessDialogProps) {
  const t = useTranslations('ws-settings.feature-request');

  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [message, setMessage] = useState('');
  const [existingRequests, setExistingRequests] = useState<
    FeatureAccessRequest[]
  >([]);
  const [selectedFeature, setSelectedFeature] =
    useState<RequestableFeatureKey | null>(null);

  const availableFeatures = useMemo(() => {
    const requestedOrApprovedFeatures = new Set(
      existingRequests
        .filter((r) => r.status === 'pending' || r.status === 'approved')
        .map((r) =>
          r.feature
            ? FEATURE_FLAG_TO_REQUESTABLE_KEY[r.feature as FeatureFlag]
            : null
        )
        .filter(Boolean)
    );

    // Also exclude features that are already enabled
    const enabledFeaturesSet = new Set();
    if (enabledFeatures) {
      Object.entries(FEATURE_FLAG_TO_REQUESTABLE_KEY).forEach(([flag, key]) => {
        if (key && enabledFeatures[flag as FeatureFlag]) {
          enabledFeaturesSet.add(key);
        }
      });
    }

    const available = getRequestableFeatureKeys().filter(
      (f) => !requestedOrApprovedFeatures.has(f) && !enabledFeaturesSet.has(f)
    );

    return available;
  }, [existingRequests, enabledFeatures]);

  useEffect(() => {
    setSelectedFeature((current) => {
      if (availableFeatures.length === 0) {
        return null;
      }
      const isValid = current && availableFeatures.includes(current);
      if (isValid) {
        return current;
      }
      return availableFeatures[0] ?? null;
    });
  }, [availableFeatures]);

  const checkExistingRequests = useCallback(async () => {
    try {
      setIsCheckingStatus(true);
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/feature-request`
      );

      if (response.ok) {
        const data = await response.json();
        setExistingRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error checking existing requests:', error);
      // Don't show toast on initial check
    } finally {
      setIsCheckingStatus(false);
    }
  }, [wsId]);

  // Check for existing request when component mounts
  useEffect(() => {
    if (!wsId) return;
    checkExistingRequests();
  }, [wsId, checkExistingRequests]);

  const handleSubmitRequest = async () => {
    if (!message.trim()) {
      toast.error(t('toasts.error.reason-required'));
      return;
    }

    if (!selectedFeature) {
      toast.error(t('toasts.error.feature-required'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/feature-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workspaceName: workspaceName || 'Unknown Workspace',
            message: message.trim(),
            feature: selectedFeature,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(t('toasts.success.request-submitted'));
        await checkExistingRequests(); // Refresh requests list
        setMessage('');
        setSelectedFeature(null);
      } else {
        toast.error(data.error || t('toasts.error.request-failed'));
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      toast.error(t('toasts.error.request-failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'approved':
        return 'text-green-600 dark:text-green-400';
      case 'rejected':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'approved':
        return <CheckCircle className="h-4 w-4" />;
      case 'rejected':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const selectedFeatureConfig = selectedFeature
    ? getRequestableFeature(selectedFeature)
    : null;
  const SelectedFeatureIcon = selectedFeatureConfig?.icon;

  const requestsToShow = existingRequests.filter(
    (req) => req.status === 'pending' || req.status === 'rejected'
  );

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {SelectedFeatureIcon ? (
              <SelectedFeatureIcon className="h-5 w-5 text-dynamic-blue" />
            ) : null}
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {t('description', { ws: workspaceName || 'Unknown Workspace' })}
            <br />
            {t('description-2')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="feature">{t('feature-label')}</Label>
              {isCheckingStatus ? (
                <div className="h-10 w-full animate-pulse rounded-lg bg-dynamic-blue/10" />
              ) : (
                <Select
                  value={selectedFeature ?? ''}
                  onValueChange={(v) =>
                    setSelectedFeature(v as RequestableFeatureKey)
                  }
                  disabled={availableFeatures.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('feature-placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFeatures.map((key) => {
                      const config = getRequestableFeature(key);
                      const Icon = config.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <span>{config.name}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
            {availableFeatures.length === 0 && !isCheckingStatus && (
              <div className="col-span-1 flex items-center justify-center rounded-lg border border-dynamic-blue/20 border-dashed bg-dynamic-blue/5 p-4 text-center text-muted-foreground text-sm">
                {t('no-features')}
              </div>
            )}
          </div>

          {selectedFeatureConfig && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="message">{t('reason-label')}</Label>
                <Textarea
                  id="message"
                  placeholder={t('reason-placeholder', {
                    feature: selectedFeatureConfig.name.toLowerCase(),
                  })}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="resize-none focus:border-dynamic-blue/60 focus:ring-dynamic-blue/20"
                />
                <p className="text-muted-foreground text-xs">
                  {t('reason-description')}
                </p>
              </div>
            </>
          )}

          {requestsToShow.length > 0 && (
            <div>
              <h4 className="mb-2 font-medium text-foreground text-sm">
                {t('existing-requests-title')}
              </h4>
              <div className="space-y-2 rounded-lg border p-3">
                {requestsToShow.map((req) => {
                  // Convert feature flag back to requestable key to get config
                  const requestableKey = req.feature
                    ? FEATURE_FLAG_TO_REQUESTABLE_KEY[
                        req.feature as FeatureFlag
                      ]
                    : null;
                  const config = requestableKey
                    ? getRequestableFeature(requestableKey)
                    : null;
                  const Icon = config?.icon;
                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        {Icon && <Icon className="h-4 w-4" />}
                        <span className="font-medium">
                          {config?.name || req.feature}
                        </span>
                      </div>
                      <div
                        className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${getStatusColor(
                          req.status
                        )}`}
                      >
                        {getStatusIcon(req.status)}
                        <span className="font-medium capitalize">
                          {req.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmitRequest}
            disabled={
              isLoading ||
              !message.trim() ||
              message.trim().length < 20 ||
              !selectedFeature
            }
            className="bg-dynamic-blue text-white hover:bg-dynamic-blue/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('submitting')}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {t('submit')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
