'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface EligibleWorkspace {
  id: string;
  name: string | null;
}

export default function PersonalWorkspacePrompt({
  eligibleWorkspaces,
  title,
  description,
  nameRule,
  createLabel,
  markLabel,
  selectPlaceholder,
}: {
  eligibleWorkspaces: EligibleWorkspace[];
  title: string;
  description: string;
  nameRule: string;
  createLabel: string;
  markLabel: string;
  selectPlaceholder: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const t = useTranslations('personal-workspace');

  const onCreate = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/workspaces/personal', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed');
      router.push('/personal');
    } finally {
      setSubmitting(false);
    }
  };

  const onMark = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/workspaces/personal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: selectedId }),
      });
      if (!res.ok) throw new Error('Failed');
      router.push('/personal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showXIcon={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex h-full w-full flex-col items-center justify-center p-4 md:p-8">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl md:text-3xl">{title}</DialogTitle>
            <DialogDescription className="text-base text-muted-foreground md:text-lg">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="rounded-md border border-dynamic-foreground/10 bg-background/40 p-3 text-muted-foreground text-xs">
              {nameRule}
            </div>
            <div className="rounded-md border border-dynamic-foreground/10 bg-background/40 p-4">
              <div className="mb-2 font-medium text-sm">{createLabel}</div>
              <div className="mb-4 text-muted-foreground text-sm">
                {t('create_new_personal_workspace')}
              </div>
              <Button
                className="w-full"
                size="sm"
                onClick={onCreate}
                disabled={submitting}
              >
                {createLabel}
              </Button>
            </div>

            {eligibleWorkspaces.length > 0 && (
              <>
                <div className="relative flex items-center justify-center">
                  <div className="h-px w-full bg-muted-foreground/20" />
                  <span className="absolute bg-card px-2 text-muted-foreground text-xs uppercase tracking-wide">
                    or
                  </span>
                </div>
                <div className="rounded-md border border-dynamic-foreground/10 bg-background/40 p-4">
                  <div className="mb-2 font-medium text-sm">{markLabel}</div>
                  <div className="mb-4 text-muted-foreground text-sm">
                    Choose one of your existing workspaces (must be owned by you
                    and have exactly one member).
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select onValueChange={(v) => setSelectedId(v)}>
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder={selectPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleWorkspaces.map((ws) => (
                          <SelectItem key={ws.id} value={ws.id}>
                            {ws.name || 'Untitled'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onMark}
                      disabled={!selectedId || submitting}
                      className="sm:min-w-[10rem]"
                    >
                      {markLabel}
                    </Button>
                  </div>
                </div>
              </>
            )}

            <div className="mt-2 text-muted-foreground text-xs">
              {t('change_prompt')}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
