'use client';

import AIModelSelector from './model-selector';
import { zodResolver } from '@hookform/resolvers/zod';
import { AIPrompt } from '@tutur3u/types/db';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tutur3u/ui/components/ui/accordion';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tutur3u/ui/components/ui/form';
import { Input } from '@tutur3u/ui/components/ui/input';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { Textarea } from '@tutur3u/ui/components/ui/textarea';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

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

  const form = useForm<z.infer<typeof FormSchema>>({
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
