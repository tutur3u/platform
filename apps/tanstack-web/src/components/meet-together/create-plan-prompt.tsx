'use client';

import { ClipboardList, MapPin } from '@tuturuuu/icons';
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
import { Input } from '@tuturuuu/ui/input';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import type { MeetTogetherContent } from './meet-together-content';

export function CreatePlanPrompt({
  canCreate,
  content,
}: {
  canCreate: boolean;
  content: MeetTogetherContent['form'];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className={cn(
            'group relative col-span-full mt-4 inline-flex w-full',
            canCreate ? 'cursor-pointer' : 'cursor-not-allowed opacity-30'
          )}
          disabled={!canCreate}
          type="button"
        >
          <div
            className={cn(
              'absolute -inset-px animate-tilt rounded-lg bg-linear-to-r from-dynamic-light-red/80 via-dynamic-light-pink/80 to-dynamic-light-blue/80 opacity-70 blur-lg transition-all',
              canCreate &&
                'group-hover:-inset-1 group-hover:opacity-100 group-hover:duration-200'
            )}
          />
          <div className="relative inline-flex w-full items-center justify-center rounded-lg bg-linear-to-r from-dynamic-light-red/60 via-dynamic-light-pink/60 to-dynamic-light-blue/60 px-8 py-2 font-bold text-white transition-all md:text-lg">
            {content.createPlan}
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{content.newPlan}</DialogTitle>
          <DialogDescription>{content.newPlanDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Input
            aria-label={content.newPlan}
            defaultValue={content.untitledPlan}
          />
          <Separator />
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-foreground text-sm">
                {content.extraFeaturesTitle}
              </h3>
              <p className="text-muted-foreground text-xs">
                {content.extraFeaturesDescription}
              </p>
            </div>
            <FeaturePreview
              description={content.whereDescription}
              icon={<MapPin className="h-4 w-4 text-dynamic-blue" />}
              title={content.whereTitle}
            />
            <FeaturePreview
              description={content.agendaDescription}
              icon={<ClipboardList className="h-4 w-4 text-dynamic-green" />}
              title={content.agendaTitle}
            />
          </div>
          <p className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-sm">
            {content.loginToSave}
          </p>
        </div>
        <DialogFooter>
          <Button asChild variant="outline">
            <a href="/register">{content.createAccount}</a>
          </Button>
          <Button asChild>
            <a href="/login">{content.signIn}</a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeaturePreview({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <div className="font-medium text-foreground text-sm">{title}</div>
          <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
