'use client';

import { Check, ChevronDown, Minus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';

const featureCategories = [
  {
    category: 'core',
    features: [
      { name: 'tasks', free: true, plus: true, pro: true, enterprise: true },
      {
        name: 'calendar',
        free: 'limited',
        plus: true,
        pro: true,
        enterprise: true,
      },
      {
        name: 'aiChat',
        free: 'limited',
        plus: true,
        pro: 'advanced',
        enterprise: 'advanced',
      },
      {
        name: 'qrGenerator',
        free: true,
        plus: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: 'tools',
    features: [
      {
        name: 'crmInventory',
        free: 'beta',
        plus: 'beta',
        pro: 'beta',
        enterprise: 'beta',
      },
      {
        name: 'tuwrite',
        free: false,
        plus: 'soon',
        pro: 'soon',
        enterprise: 'soon',
      },
      {
        name: 'tuchat',
        free: false,
        plus: 'soon',
        pro: 'soon',
        enterprise: 'soon',
      },
      {
        name: 'tumeet',
        free: false,
        plus: 'soon',
        pro: 'soon',
        enterprise: 'soon',
      },
    ],
  },
  {
    category: 'collaboration',
    features: [
      {
        name: 'whiteboards',
        free: false,
        plus: true,
        pro: true,
        enterprise: true,
      },
      { name: 'drive', free: false, plus: true, pro: true, enterprise: true },
      {
        name: 'timeTracker',
        free: false,
        plus: true,
        pro: true,
        enterprise: true,
      },
      {
        name: 'granularRoles',
        free: false,
        plus: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: 'advanced',
    features: [
      {
        name: 'advancedAI',
        free: false,
        plus: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'prioritySupport',
        free: false,
        plus: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'analytics',
        free: false,
        plus: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'customIntegrations',
        free: false,
        plus: false,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: 'enterprise',
    features: [
      {
        name: 'customSolutions',
        free: false,
        plus: false,
        pro: false,
        enterprise: true,
      },
      {
        name: 'dedicatedSupport',
        free: false,
        plus: false,
        pro: false,
        enterprise: true,
      },
      { name: 'sla', free: false, plus: false, pro: false, enterprise: true },
      {
        name: 'selfHosting',
        free: false,
        plus: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
];

type FeatureValue = boolean | string;

export function FeatureMatrix() {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('landing.pricing');

  const renderValue = (value: FeatureValue) => {
    if (value === true) {
      return <Check className="h-4 w-4 text-dynamic-green" />;
    }
    if (value === false) {
      return <Minus className="h-4 w-4 text-foreground/30" />;
    }
    if (value === 'beta') {
      return (
        <span className="rounded bg-dynamic-yellow/10 px-1.5 py-0.5 font-medium text-[10px] text-dynamic-yellow">
          Beta
        </span>
      );
    }
    if (value === 'soon') {
      return (
        <span className="text-[10px] text-foreground/40 italic">
          {t('matrix.values.soon' as any)}
        </span>
      );
    }
    // Translate known string values, pass through numbers as-is
    const translatedValue =
      value === 'limited' || value === 'unlimited' || value === 'advanced'
        ? t(`matrix.values.${value}` as any)
        : value;
    return (
      <span className="text-foreground/70 text-xs">{translatedValue}</span>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="mx-auto flex items-center gap-2 text-foreground/60 hover:text-foreground"
        >
          {t('compare')}
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {/* Horizontal scroll wrapper */}
        <div className="mt-8 overflow-x-auto rounded-xl border border-foreground/10">
          <div className="min-w-150">
            {/* Fixed Header */}
            <div className="grid grid-cols-[minmax(140px,1fr)_repeat(4,minmax(80px,1fr))] border-foreground/10 border-b bg-muted/50 sm:grid-cols-[minmax(180px,1.5fr)_repeat(4,1fr)]">
              <div className="px-3 py-3 font-medium text-foreground/60 text-sm sm:px-4">
                {t('matrix.featuresLabel')}
              </div>
              <div className="px-2 py-3 text-center font-medium text-sm sm:px-4">
                Free
              </div>
              <div className="px-2 py-3 text-center font-medium text-dynamic-blue text-sm sm:px-4">
                Plus
              </div>
              <div className="px-2 py-3 text-center font-medium text-dynamic-purple text-sm sm:px-4">
                Pro
              </div>
              <div className="px-2 py-3 text-center font-medium text-dynamic-orange text-sm sm:px-4">
                Enterprise
              </div>
            </div>

            {/* Scrollable Body - vertical only */}
            <div className="max-h-[50vh] overflow-y-auto">
              <div className="grid grid-cols-[minmax(140px,1fr)_repeat(4,minmax(80px,1fr))] sm:grid-cols-[minmax(180px,1.5fr)_repeat(4,1fr)]">
                {/* Categories */}
                {featureCategories.map((category) => (
                  <Fragment key={category.category}>
                    {/* Category Header */}
                    <div className="col-span-5 border-foreground/10 border-b bg-foreground/2 px-3 py-2 sm:px-4">
                      <span className="font-medium text-foreground/70 text-xs uppercase tracking-wider">
                        {t(`matrix.categories.${category.category}` as any)}
                      </span>
                    </div>

                    {/* Features */}
                    {category.features.map((feature, index) => (
                      <Fragment key={feature.name}>
                        <div
                          className={cn(
                            'bg-background px-3 py-2.5 text-foreground/70 text-sm sm:px-4',
                            index < category.features.length - 1 &&
                              'border-foreground/5 border-b'
                          )}
                        >
                          {t(`matrix.featuresList.${feature.name}` as any)}
                        </div>
                        <div
                          className={cn(
                            'flex items-center justify-center bg-background px-2 py-2.5 sm:px-4',
                            index < category.features.length - 1 &&
                              'border-foreground/5 border-b'
                          )}
                        >
                          {renderValue(feature.free)}
                        </div>
                        <div
                          className={cn(
                            'flex items-center justify-center bg-background px-2 py-2.5 sm:px-4',
                            index < category.features.length - 1 &&
                              'border-foreground/5 border-b'
                          )}
                        >
                          {renderValue(feature.plus)}
                        </div>
                        <div
                          className={cn(
                            'flex items-center justify-center bg-background px-2 py-2.5 sm:px-4',
                            index < category.features.length - 1 &&
                              'border-foreground/5 border-b'
                          )}
                        >
                          {renderValue(feature.pro)}
                        </div>
                        <div
                          className={cn(
                            'flex items-center justify-center bg-background px-2 py-2.5 sm:px-4',
                            index < category.features.length - 1 &&
                              'border-foreground/5 border-b'
                          )}
                        >
                          {renderValue(feature.enterprise)}
                        </div>
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
