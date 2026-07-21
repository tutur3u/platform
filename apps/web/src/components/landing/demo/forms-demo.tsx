'use client';

import { BarChart3, ClipboardList, Share2 } from '@tuturuuu/icons/lucide';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  DemoCta,
  DemoFrame,
  DemoHeading,
  DemoItem,
  DemoLabel,
  DemoPane,
  DemoPulse,
  DemoStat,
} from './demo-chrome';
import {
  type FormFieldSlotId,
  formFieldSlots,
  formsFigures,
  responseBars,
} from './forms-data';

/**
 * Forms room.
 *
 * Two panes of the same object: the fields on the left, what people answered on
 * the right. Build it, share it, read the results.
 *
 * Class names come from static maps only, and every entrance animation is
 * collapsed under reduced motion.
 */

const ACCENT = 'green' as const;
const EASE = [0.16, 1, 0.3, 1] as const;

function FieldBuilder({
  fields,
  requiredLabel,
  submitLabel,
}: {
  fields: {
    id: FormFieldSlotId;
    index: string;
    label: string;
    type: string;
    required: boolean;
  }[];
  requiredLabel: string;
  submitLabel: string;
}) {
  return (
    <div className="p-2.5">
      <ul className="space-y-1.5">
        {fields.map((field) => (
          <li
            className="flex items-center gap-2.5 rounded-lg border border-foreground/[0.07] bg-foreground/[0.015] px-2.5 py-2 transition-colors duration-300 hover:bg-foreground/[0.035]"
            key={field.id}
          >
            <span className="font-mono-ui text-[0.55rem] text-foreground/25 tabular-nums">
              {field.index}
            </span>
            <span className="min-w-0 truncate font-display text-[0.78rem] text-foreground/75">
              {field.label}
            </span>
            {field.required ? (
              <span className="rounded border border-dynamic-green/25 bg-dynamic-green/10 px-1.5 py-0.5">
                <DemoLabel className="text-dynamic-green">
                  {requiredLabel}
                </DemoLabel>
              </span>
            ) : null}
            <span className="ml-auto shrink-0 rounded border border-foreground/[0.08] px-1.5 py-0.5">
              <DemoLabel className="text-foreground/35">{field.type}</DemoLabel>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2.5 flex items-center justify-end">
        <span className="rounded-lg border border-dynamic-green/25 bg-dynamic-green/10 px-3 py-1.5">
          <DemoLabel className="text-dynamic-green">{submitLabel}</DemoLabel>
        </span>
      </div>
    </div>
  );
}

function CompletionMeter({ label }: { label: string }) {
  const reduced = useReducedMotion();

  return (
    <div className="border-foreground/[0.06] border-b p-3">
      <div className="flex items-center justify-between gap-3">
        <DemoLabel className="text-foreground/35">{label}</DemoLabel>
        <span className="font-mono-ui text-[0.68rem] text-dynamic-green tabular-nums">
          {formsFigures.completion}
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
        <motion.div
          animate={{ scaleX: formsFigures.completionRatio }}
          className="h-full w-full origin-left rounded-full bg-gradient-to-r from-dynamic-green to-dynamic-cyan"
          initial={{ scaleX: reduced ? formsFigures.completionRatio : 0 }}
          transition={{ duration: reduced ? 0 : 1.1, ease: EASE }}
        />
      </div>
    </div>
  );
}

function ResponseDistribution() {
  const reduced = useReducedMotion();

  return (
    <div className="space-y-1.5 p-3">
      {responseBars.map((bar, index) => (
        <div className="flex items-center gap-2.5" key={bar.id}>
          <span className="w-3 shrink-0 font-mono-ui text-[0.6rem] text-foreground/30 tabular-nums">
            {bar.tick}
          </span>
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.05]">
            <motion.span
              animate={{ scaleX: bar.ratio }}
              className="block h-full w-full origin-left rounded-full bg-dynamic-green/60"
              initial={{ scaleX: reduced ? bar.ratio : 0 }}
              transition={{
                duration: reduced ? 0 : 0.7,
                ease: EASE,
                delay: reduced ? 0 : 0.12 + index * 0.07,
              }}
            />
          </span>
          <span className="w-8 shrink-0 text-right font-mono-ui text-[0.6rem] text-foreground/45 tabular-nums">
            {bar.count}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FormsDemo() {
  const product = useTranslations('marketing-nav.products');
  const common = useTranslations('common');
  const login = useTranslations('login');
  const fieldTypes = useTranslations('user-field-data-table');
  const polls = useTranslations('ws-polls');
  const builder = useTranslations('habit-tracker.form');
  const memories = useTranslations('ws-memories');
  const cta = useTranslations('landing.cta');

  const slotCopy: Record<FormFieldSlotId, { label: string; type: string }> = {
    name: { label: common('name'), type: fieldTypes('text') },
    email: { label: login('email'), type: fieldTypes('text') },
    date: { label: common('date'), type: fieldTypes('date') },
    rating: { label: polls('rating'), type: polls('multiple_choice') },
    feedback: { label: common('feedback'), type: fieldTypes('text') },
  };

  const fields = formFieldSlots.map((slot) => ({
    id: slot.id,
    index: slot.index,
    required: slot.required,
    label: slotCopy[slot.id].label,
    type: slotCopy[slot.id].type,
  }));

  return (
    <DemoPane>
      <DemoItem>
        <DemoHeading
          accent={ACCENT}
          aside={
            <span className="rounded-full border border-dynamic-green/20 bg-dynamic-green/[0.06] px-2.5 py-1">
              <DemoLabel className="text-dynamic-green">
                {common('published')}
              </DemoLabel>
            </span>
          }
          kicker={product('forms.label')}
          title={product('forms.description')}
        />
      </DemoItem>

      <DemoItem>
        <div className="grid grid-cols-2 gap-2.5">
          <DemoStat
            accent={ACCENT}
            label={polls('total_votes')}
            value={formsFigures.responses}
          />
          <DemoStat
            accent="purple"
            label={polls('average_rating')}
            value={formsFigures.average}
          />
        </div>
      </DemoItem>

      <DemoItem>
        <div className="grid gap-2.5 lg:grid-cols-2">
          <DemoFrame
            accent={ACCENT}
            icon={ClipboardList}
            label={builder('fields_title')}
            meta={
              <span className="flex items-center gap-1.5">
                <Share2 className="h-3 w-3 text-dynamic-green" />
                <DemoLabel className="hidden text-foreground/40 sm:inline">
                  {common('share')}
                </DemoLabel>
              </span>
            }
          >
            <FieldBuilder
              fields={fields}
              requiredLabel={builder('required')}
              submitLabel={common('submit')}
            />
          </DemoFrame>

          <DemoFrame
            accent={ACCENT}
            icon={BarChart3}
            label={memories('results')}
            meta={
              <>
                <DemoPulse accent={ACCENT} />
                <DemoLabel className="hidden text-foreground/40 sm:inline">
                  {polls('rating')}
                </DemoLabel>
              </>
            }
          >
            <CompletionMeter label={polls('participation_rate')} />
            <ResponseDistribution />
          </DemoFrame>
        </div>
      </DemoItem>

      <DemoItem>
        <DemoCta accent={ACCENT}>{cta('primary')}</DemoCta>
      </DemoItem>
    </DemoPane>
  );
}
