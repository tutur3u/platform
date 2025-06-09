'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { FlaskConical, Loader2 } from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface TestEventGeneratorButtonProps {
  wsId: string;
}

export default function TestEventGeneratorButton({
  wsId,
}: TestEventGeneratorButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  const generateTestEvents = async () => {
    if (isLoading) return;

    setIsLoading(true);
    toast.loading('Generating test events...', {
      id: 'generate-test-events',
    });

    try {
      const response = await fetch('/api/test-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wsId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate test events');
      }

      toast.success('Test events generated!', {
        id: 'generate-test-events',
        description: data.message,
        duration: 5000,
      });

      await queryClient.invalidateQueries({
        queryKey: ['calendarEvents', wsId],
      });
    } catch (error) {
      console.error('Test event generation error:', error);
      toast.error('Failed to generate test events', {
        id: 'generate-test-events',
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={generateTestEvents}
      disabled={isLoading}
      variant="outline"
      size="sm"
      className="w-full md:w-fit"
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <FlaskConical className="mr-2 h-4 w-4" />
      )}
      <span>{isLoading ? 'Generating...' : 'Generate Test Data'}</span>
    </Button>
  );
}
