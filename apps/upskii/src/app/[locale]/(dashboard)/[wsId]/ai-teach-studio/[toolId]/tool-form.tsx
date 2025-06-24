'use client';

import { Tool } from '../data';
import type { AIChat } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Album, RotateCcw } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ToolForm({ wsId, tool }: { wsId: string; tool: Tool }) {
  const t = useTranslations();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState(tool);

  const createChat = async (input: string) => {
    const res = await fetch(`/api/ai/chat/google/new`, {
      method: 'POST',
      body: JSON.stringify({
        model: 'gemini-1.5-flash-002',
        message: input,
        wsId: wsId,
      }),
    });

    if (!res.ok) {
      toast({
        title: t('ai_chat.something_went_wrong'),
        description: res.statusText,
      });
      return;
    }

    const { id } = (await res.json()) as AIChat;
    if (id) {
      router.push(`/${wsId}/c/${id}`);
      router.refresh();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await createChat(
      `## ${tool.name}\n> ${tool.description}\n\n` +
        formData.fields
          .filter((field) => field.value)
          .map((field) => `- **${field.label}:** ${field.value}`)
          .join('\n')
    );
  };

  const fillPlaceholderContent = () => {
    setFormData({
      ...tool,
      fields: tool.fields.map((field) => ({
        ...field,
        value: field.placeholder
          ? field.placeholder.replace(/e\.g\.\s*/i, '')
          : '',
      })),
    });
  };

  const resetContent = () => {
    setFormData(tool);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex gap-2">
        <Button
          onClick={fillPlaceholderContent}
          disabled={
            isLoading ||
            formData.fields.every(
              (field) =>
                field.value === field.placeholder?.replace(/e\.g\.\s*/i, '')
            )
          }
        >
          <Album className="h-4 w-4" />
          {t('common.example_content')}
        </Button>
        <Button
          variant="secondary"
          onClick={resetContent}
          disabled={isLoading || formData.fields.every((field) => !field.value)}
        >
          <RotateCcw className="h-4 w-4" />
          {t('common.reset')}
        </Button>
      </div>

      {formData.fields?.map((field) => {
        return (
          <div key={field.label} className="space-y-2">
            <Label htmlFor={field.label}>
              {field.label}
              {field.required && <span className="ml-1 text-red-500">*</span>}
            </Label>
            {field.type === 'text' ? (
              <Input
                id={field.label}
                placeholder={field.placeholder}
                required={field.required}
                value={field.value || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fields: formData.fields.map((f) =>
                      f.label === field.label
                        ? { ...f, value: e.target.value }
                        : f
                    ),
                  })
                }
              />
            ) : field.type === 'textarea' ? (
              <Textarea
                id={field.label}
                placeholder={field.placeholder}
                required={field.required}
                value={field.value || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fields: formData.fields.map((f) =>
                      f.label === field.label
                        ? { ...f, value: e.target.value }
                        : f
                    ),
                  })
                }
              />
            ) : (
              <Input
                id={field.label}
                placeholder={field.placeholder}
                required={field.required}
                value={field.value || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fields: formData.fields.map((f) =>
                      f.label === field.label
                        ? { ...f, value: e.target.value }
                        : f
                    ),
                  })
                }
              />
            )}
          </div>
        );
      })}

      <Button
        type="submit"
        className="w-full"
        disabled={
          isLoading ||
          formData.fields.some((field) => field.required && !field.value)
        }
      >
        {isLoading ? t('common.generating') : t('common.generate')}
      </Button>
    </form>
  );
}
