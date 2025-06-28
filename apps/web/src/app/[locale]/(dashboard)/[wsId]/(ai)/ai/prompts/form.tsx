'use client';

import type { AIPrompt } from '@tuturuuu/types/db';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import AIModelSelector from './model-selector';

interface Props {
  wsId: string;
  data?: Partial<AIPrompt>;
  onComplete?: () => void;
  submitLabel?: string;
}

const FormSchema = z.object({
  name: z.string(),
  model: z.string(),
  input: z.string(),
  output: z.string(),
});

export function AIPromptForm({ wsId, data, onComplete, submitLabel }: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: data?.name || '',
      model: data?.model || '',
      input: data?.input || '',
      output: data?.output || '',
    },
  });

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setLoading(true);
    setAccordionValue('output');

    const res = await fetch(
      data?.id
        ? `/api/v1/workspaces/${wsId}/ai/prompts/${data.id}`
        : `/api/v1/workspaces/${wsId}/ai/prompts`,
      {
        method: data?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      }
    );

    if (res.ok) {
      const { id: _, output } = await res.json();
      form.setValue('output', output);

      router.refresh();
      if (onComplete) onComplete();
    } else {
      setLoading(false);
      setAccordionValue('prompt');
      toast({
        title: 'Error creating prompt',
        description: 'An error occurred while creating the prompt',
      });
    }
  }

  const [openModelSelector, setOpenModelSelector] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);

  const [accordionValue, setAccordionValue] = useState('prompt');

  const output = form.watch('output');

  return (
    <Accordion
      type="single"
      value={accordionValue}
      onValueChange={(value) => setAccordionValue(value)}
      className="w-full overflow-visible"
    >
      <AccordionItem value="prompt">
        <AccordionTrigger>Prompt</AccordionTrigger>
        <AccordionContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-2">
              <FormField
                control={form.control}
                name="name"
                disabled={loading}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prompt name</FormLabel>
                    <FormControl>
                      <Input placeholder="New prompt" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model"
                disabled={!!data?.id || loadingModels || loading}
                render={({ field }) => (
                  <FormItem>
                    <AIModelSelector
                      label="AI Model"
                      fetchUrl="/api/v1/infrastructure/ai/models"
                      placeholder="Select a model"
                      searchPlaceholder="Find a model"
                      emptyDataMessage="No models found."
                      open={openModelSelector}
                      value={field.value}
                      onValueChange={field.onChange}
                      onOpenChange={setOpenModelSelector}
                      beforeFetch={() => setLoadingModels(true)}
                      afterFetch={(data) => {
                        // if "GOOGLE_GEMINI_PRO" is in the data, set it as the default model
                        const defaultModel = data.find(
                          (model: { id: string }) =>
                            model.id === 'gemini-2.0-flash-001'
                        );

                        if (defaultModel) field.onChange(defaultModel.id);
                        else field.onChange(data?.[0]?.id);

                        setLoadingModels(false);
                      }}
                      disabled={!!data?.id || loadingModels || loading}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="input"
                disabled={!!data?.id || loading}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Input</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Input" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('common.processing') : submitLabel}
              </Button>
            </form>
          </Form>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="output">
        <AccordionTrigger>Output</AccordionTrigger>
        <AccordionContent>
          <div className="rounded-lg border bg-foreground/5 p-2">
            {output || 'No output generated yet.'}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
