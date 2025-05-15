'use client';

import { recommendedTools, tools } from './data';
import ApiKeyInput from '@/components/form-apikey';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { KeyRound } from '@tuturuuu/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function APITooltip({
  handleOpenChange,
}: {
  handleOpenChange: (value: boolean) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          // disabled={isInternalLoading}
          size="icon"
          variant="ghost"
          className={cn('mr-1 transition duration-300')}
          onClick={() => handleOpenChange(true)}
          // disabled={!ENABLE_NEW_U || disabled}
        >
          <KeyRound className="h-20 w-20 scale-125" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>API Key</TooltipContent>
    </Tooltip>
  );
}

export default function PageContent({
  wsId,
  apiKey,
}: {
  wsId: string;
  apiKey?: string | null;
}) {
  const hasApiKey = apiKey && apiKey !== '';
  const [open, setOpen] = useState(!hasApiKey);
  const { toast } = useToast();
  const router = useRouter();

  const handleOpenChange = (value: boolean) => {
    if (open && !hasApiKey) {
      toast({
        title: 'API Key',
        description: 'No API Key Inputted. Navigating to the home page.',
        variant: 'destructive',
      });
      router.push(`/${wsId}/home`);
    } else {
      console.log('open', open, 'value', value);
      setOpen(value);
    }
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div className="grid gap-8 py-8">
        <section>
          <div className="flex justify-between">
            <h2 className="from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue mb-4 w-fit bg-gradient-to-br bg-clip-text py-1 text-xl font-bold text-transparent lg:text-3xl">
              Recommended For You
            </h2>
            <APITooltip handleOpenChange={handleOpenChange} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recommendedTools.map((tool) => (
              <Link
                href={`/${wsId}/ai-teach-studio/${tool.id}`}
                key={tool.name}
                className="group h-full"
              >
                <Card className="group-hover:border-foreground h-full">
                  <CardHeader>
                    <CardTitle className="line-clamp-2">{tool.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-2">{tool.description}</p>
                    <div className="flex flex-wrap items-center gap-1 text-sm font-semibold">
                      {tool.tags.map((tag) => (
                        <p
                          key={`${tool.name}-${tag}`}
                          className="border-dynamic-purple/20 bg-dynamic-light-purple/10 text-dynamic-light-purple mt-2 w-fit rounded-full border px-2 py-0.5"
                        >
                          {tag}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue mb-4 w-fit bg-gradient-to-br bg-clip-text py-1 text-xl font-bold text-transparent lg:text-3xl">
            All Tools
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {tools.map((tool) => (
              <Link
                href={`/${wsId}/ai-teach-studio/${tool.id}`}
                key={tool.name}
                className="group h-full"
              >
                <Card className="group-hover:border-foreground h-full">
                  <CardHeader>
                    <CardTitle className="line-clamp-2">{tool.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-2">{tool.description}</p>
                    <div className="flex flex-wrap items-center gap-1 text-sm font-semibold">
                      {tool.tags.map((tag) => (
                        <p
                          key={`${tool.name}-${tag}`}
                          className="border-dynamic-purple/20 bg-dynamic-light-purple/10 text-dynamic-light-purple mt-2 w-fit rounded-full border px-2 py-0.5"
                        >
                          {tag}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Input API Key</DialogTitle>
          <DialogDescription>
            Please get your API key from the Google AI Studio and input here to
            continue
          </DialogDescription>
        </DialogHeader>
        <ApiKeyInput defaultValue={apiKey} />
        {!hasApiKey && (
          <DialogFooter>
            <Button
              variant="secondary"
              className="w-full"
              type="button"
              onClick={() => handleOpenChange(false)}
            >
              Back to Home
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
