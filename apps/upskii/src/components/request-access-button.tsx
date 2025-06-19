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
import {
  BookText,
  CheckCircle,
  Clock,
  Loader2,
  Send,
  XCircle,
} from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface RequestAccessButtonProps {
  workspaceName: string | null;
  wsId: string;
}

interface EducationAccessRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  message: string;
  admin_notes?: string;
  created_at: string;
}

export function RequestAccessButton({
  workspaceName,
  wsId,
}: RequestAccessButtonProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [message, setMessage] = useState('');
  const [existingRequest, setExistingRequest] =
    useState<EducationAccessRequest | null>(null);

  // Check for existing request when component mounts
  useEffect(() => {
    checkExistingRequest();
  }, [wsId]);

  const checkExistingRequest = async () => {
    try {
      setIsCheckingStatus(true);
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/education-access-request`
      );

      if (response.ok) {
        const data = await response.json();
        setExistingRequest(data.request);
      }
    } catch (error) {
      console.error('Error checking existing request:', error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!message.trim()) {
      toast.error('Please provide a reason for your request');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/education-access-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workspaceName: workspaceName || 'Unknown Workspace',
            message: message.trim(),
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(
          'Education access request submitted successfully! Platform administrators will review your request.'
        );
        setExistingRequest(data.request);
        setOpen(false);
        setMessage('');
      } else {
        toast.error(
          data.error || 'Failed to submit request. Please try again.'
        );
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      toast.error('Failed to submit request. Please try again.');
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

  if (isCheckingStatus) {
    return (
      <div className="flex h-10 w-[200px] animate-pulse rounded-lg bg-dynamic-blue/10" />
    );
  }

  // Show status if request exists
  if (existingRequest) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div
          className={`flex items-center gap-2 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 px-3 py-2 text-sm ${getStatusColor(existingRequest.status)}`}
        >
          {getStatusIcon(existingRequest.status)}
          <span className="font-medium capitalize">
            {existingRequest.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {existingRequest.status === 'pending' &&
            'Your request is being reviewed'}
          {existingRequest.status === 'approved' &&
            'Request approved! Education features will be enabled soon.'}
          {existingRequest.status === 'rejected' &&
            'Request was not approved at this time'}
        </p>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          <BookText className="h-4 w-4" />
          Request Education Access
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookText className="h-5 w-5 text-dynamic-blue" />
            Request Education Features
          </DialogTitle>
          <DialogDescription>
            Request access to education features for your workspace "
            <span className="font-medium text-dynamic-blue">
              {workspaceName}
            </span>
            ". Platform administrators will review your request and approve
            access if appropriate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="message">
              Why do you need access to education features? *
            </Label>
            <Textarea
              id="message"
              placeholder="Please explain how you plan to use the education features in your workspace. Include details about your intended use case, target audience, and educational goals..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="resize-none focus:border-dynamic-blue/60 focus:ring-dynamic-blue/20"
            />
            <p className="text-xs text-muted-foreground">
              Minimum 20 characters. Be specific about your educational goals.
            </p>
          </div>

          <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4 text-sm">
            <h4 className="mb-2 font-semibold text-dynamic-blue">
              Education features include:
            </h4>
            <ul className="space-y-1 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-dynamic-blue/60"></span>
                <span>
                  Course creation and management with multimedia content
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-dynamic-blue/60"></span>
                <span>
                  Interactive quiz and assessment tools with detailed analytics
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-dynamic-blue/60"></span>
                <span>Student progress tracking and performance insights</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-dynamic-blue/60"></span>
                <span>
                  Automated certificate generation upon course completion
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-dynamic-blue/60"></span>
                <span>AI-powered teaching studio and content assistance</span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitRequest}
            disabled={
              isLoading || !message.trim() || message.trim().length < 20
            }
            className="bg-dynamic-blue text-white hover:bg-dynamic-blue/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
