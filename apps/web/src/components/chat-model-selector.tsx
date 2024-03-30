'use client';

import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useState } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Model, defaultModel, models, providers } from '@/data/models';
import { Separator } from './ui/separator';

export function ChatModelSelector({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  const [selectedModel, setSelectedModel] = useState<Model>(defaultModel);
  const [previewModel, setPreviewModel] = useState<Model>(defaultModel);

  const currentModel = models.find((model) => model.value === previewModel);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o) setPreviewModel(selectedModel);
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`flex w-full ${className}`}
        >
          <div className="line-clamp-1 text-start">
            {selectedModel
              ? `${models.find((model) => model.value === selectedModel)?.provider.toLowerCase()}/${models.find((model) => model.value === selectedModel)?.label}`
              : 'Select model'}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-80 p-0 md:w-[48rem] md:grid-cols-2 xl:w-[64rem]">
        <Command className="rounded-b-none border-b md:rounded-r-none md:border-b-0 md:border-r">
          <CommandInput placeholder="Search model..." />
          <ScrollArea className="h-48 md:h-64">
            <CommandEmpty>No model found.</CommandEmpty>
            {providers.map((provider) => (
              <CommandGroup key={provider} heading={provider}>
                {models
                  .filter((model) => model.provider === provider)
                  .map((model) => (
                    <CommandItem
                      key={model.value}
                      value={model.value}
                      onSelect={(currentValue) => {
                        setSelectedModel(
                          currentValue === selectedModel
                            ? defaultModel
                            : (currentValue as Model)
                        );

                        setOpen(false);
                      }}
                      onMouseOver={() => setPreviewModel(model.value)}
                      disabled={model.disabled}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedModel === model.value
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      <div className="bg-foreground text-background rounded-full px-2 py-0.5">
                        {model.label}
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </ScrollArea>
        </Command>

        <div>
          <div className="flex items-center px-2 pb-1 pt-3">
            <div className="text-sm font-semibold opacity-80">
              {currentModel?.provider}{' '}
            </div>
            <div className="bg-foreground/20 mx-2 h-4 w-[1px] rotate-[30deg]" />
            <div className="line-clamp-1 text-xs">{currentModel?.model}</div>
          </div>
          <Separator className="my-2" />
          <div className="p-2 pt-0">
            <div className="text-sm">{currentModel?.description}</div>
            {currentModel?.context != undefined && (
              <>
                <Separator className="my-2" />
                <div className="bg-foreground text-background rounded px-2 py-0.5 text-center text-sm font-semibold">
                  {Intl.NumberFormat('en-US', {
                    style: 'decimal',
                  }).format(currentModel.context)}{' '}
                  tokens
                </div>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
