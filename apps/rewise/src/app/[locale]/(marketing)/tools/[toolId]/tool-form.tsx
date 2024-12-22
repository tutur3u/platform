'use client';

import { Tool } from '../data';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ToolForm({ tool }: { tool: Tool }) {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // TODO: Implement form submission

    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {tool.fields?.map((field) => (
        <div key={field.label} className="space-y-2">
          <Label htmlFor={field.label}>
            {field.label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </Label>
          <Input
            id={field.label}
            placeholder={field.placeholder}
            required={field.required}
          />
        </div>
      ))}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? t('common.generating') : t('common.generate')}
      </Button>
    </form>
  );
}
