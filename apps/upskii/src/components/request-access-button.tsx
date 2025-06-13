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
import { BookText, Loader2, Send } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useState } from 'react';
import { toast } from 'sonner';

interface RequestAccessButtonProps {
  workspaceName: string;
  wsId: string;
}

export function RequestAccessButton({
  workspaceName,
  wsId,
}: RequestAccessButtonProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmitRequest = async () => {
    if (!message.trim()) {
      toast.error('Please provide a reason for your request');
      return;
    }

    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      await mockSubmitFeatureRequest({
        wsId,
        workspaceName,
        feature: 'Education Features',
        message: message.trim(),
      });

      toast.success(
        'Access request submitted successfully! Platform administrators will review your request.'
      );
      setOpen(false);
      setMessage('');
    } catch (error) {
      toast.error('Failed to submit request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2 border-blue-200 text-blue-600 hover:bg-blue-50"
        >
          <BookText className="h-4 w-4" />
          Request Education Access
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookText className="h-5 w-5 text-blue-600" />
            Request Education Features
          </DialogTitle>
          <DialogDescription>
            Request access to education features for your workspace "
            {workspaceName}". Platform administrators will review your request
            and approve access if appropriate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="message">
              Why do you need access to education features?
            </Label>
            <Textarea
              id="message"
              placeholder="Please explain how you plan to use the education features in your workspace..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            <strong>Education features include:</strong>
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>Course creation and management</li>
              <li>Quiz and assessment tools</li>
              <li>Student progress tracking</li>
              <li>Certificate generation</li>
              <li>AI-powered teaching studio</li>
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
            disabled={isLoading || !message.trim()}
            className="bg-blue-600 hover:bg-blue-700"
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

// Mock function to simulate API call
// TODO: Replace with actual API implementation
const mockSubmitFeatureRequest = async ({
  wsId,
  workspaceName,
  feature,
  message,
}: {
  wsId: string;
  workspaceName: string;
  feature: string;
  message: string;
}): Promise<void> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Simulate occasional failures for testing
  if (Math.random() < 0.05) {
    throw new Error('Failed to submit request');
  }

  console.log('Feature request submitted:', {
    wsId,
    workspaceName,
    feature,
    message,
  });
};
