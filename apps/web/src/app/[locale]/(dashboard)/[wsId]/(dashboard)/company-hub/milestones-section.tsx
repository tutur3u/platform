'use client';

import {
  Briefcase,
  Building2,
  Cake,
  Check,
  Clock,
  Gift,
  PartyPopper,
  Sparkles,
  Star,
  Trophy,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { YearInfo } from './types';

export function MilestonesSection({ yearInfo }: { yearInfo: YearInfo }) {
  const t = useTranslations('dashboard.year_schedule');

  return (
    <div className="space-y-3">
      {/* Birthday Section */}
      {yearInfo.isBirthday ? (
        <div className="relative overflow-hidden rounded-xl border-2 border-dynamic-pink/30 bg-linear-to-r from-dynamic-pink/10 via-dynamic-yellow/5 to-dynamic-orange/10 p-4">
          <div className="pointer-events-none absolute inset-0">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-bounce opacity-30"
                style={{
                  left: `${(i * 12 + 5) % 100}%`,
                  top: `${(i * 15 + 10) % 100}%`,
                  animationDelay: `${i * 0.15}s`,
                }}
              >
                {i % 3 === 0 ? (
                  <Sparkles className="h-3 w-3 text-dynamic-yellow" />
                ) : i % 3 === 1 ? (
                  <PartyPopper className="h-3 w-3 text-dynamic-pink" />
                ) : (
                  <Gift className="h-3 w-3 text-dynamic-orange" />
                )}
              </div>
            ))}
          </div>
          <div className="relative text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <PartyPopper className="h-5 w-5 text-dynamic-pink" />
              <span className="bg-linear-to-r from-dynamic-pink via-dynamic-orange to-dynamic-yellow bg-clip-text font-bold text-lg text-transparent">
                {t('birthday.happy_birthday', {
                  count: yearInfo.companyAge.years,
                })}
              </span>
              <Cake className="h-5 w-5 text-dynamic-orange" />
            </div>
            <p className="text-dynamic-pink/70 text-sm">
              {t('birthday.years_of_innovation', {
                count: yearInfo.companyAge.years,
              })}
            </p>
          </div>
        </div>
      ) : (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto w-full justify-between rounded-xl border border-border/50 bg-muted/20 p-3 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/15">
                  <Cake className="h-4 w-4 text-dynamic-orange" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">{t('birthday.title')}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('birthday.date')} • {t('birthday.founded')}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Clock className="h-3 w-3" />
                {t('birthday.days_until', {
                  count: yearInfo.daysUntilBirthday,
                })}
              </Badge>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {t('birthday.next_birthday', {
                    age: yearInfo.companyAge.years + 1,
                    year:
                      new Date().getFullYear() +
                      (yearInfo.currentMonth > 6 ? 1 : 0),
                  })}
                </span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* JSC Birthday Section */}
      {yearInfo.isJscBirthday ? (
        <div className="relative overflow-hidden rounded-xl border-2 border-dynamic-blue/30 bg-linear-to-r from-dynamic-blue/10 via-dynamic-cyan/5 to-dynamic-green/10 p-4">
          <div className="pointer-events-none absolute inset-0">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-bounce opacity-30"
                style={{
                  left: `${(i * 12 + 5) % 100}%`,
                  top: `${(i * 15 + 10) % 100}%`,
                  animationDelay: `${i * 0.15}s`,
                }}
              >
                {i % 3 === 0 ? (
                  <Star className="h-3 w-3 text-dynamic-cyan" />
                ) : i % 3 === 1 ? (
                  <Briefcase className="h-3 w-3 text-dynamic-blue" />
                ) : (
                  <PartyPopper className="h-3 w-3 text-dynamic-green" />
                )}
              </div>
            ))}
          </div>
          <div className="relative text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <Briefcase className="h-5 w-5 text-dynamic-blue" />
              <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text font-bold text-lg text-transparent">
                {t('jsc_birthday.happy_birthday', {
                  count: yearInfo.jscAge.years,
                })}
              </span>
              <Star className="h-5 w-5 text-dynamic-cyan" />
            </div>
            <p className="text-dynamic-blue/70 text-sm">
              {t('jsc_birthday.years_of_growth', {
                count: yearInfo.jscAge.years,
              })}
            </p>
          </div>
        </div>
      ) : (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto w-full justify-between rounded-xl border border-border/50 bg-muted/20 p-3 hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-blue/15">
                  <Briefcase className="h-4 w-4 text-dynamic-blue" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">
                    {t('jsc_birthday.title')}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('jsc_birthday.date')} • {t('jsc_birthday.incorporated')}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Clock className="h-3 w-3" />
                {t('jsc_birthday.days_until', {
                  count: yearInfo.daysUntilJscBirthday,
                })}
              </Badge>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {t('jsc_birthday.next_birthday', {
                    age: yearInfo.jscAge.years + 1,
                    year:
                      new Date().getFullYear() +
                      (yearInfo.currentMonth > 4 ? 1 : 0),
                  })}
                </span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Year End Party Section */}
      {yearInfo.isYearEndPartyMonth ? (
        <div className="relative overflow-hidden rounded-xl border-2 border-dynamic-purple/30 bg-linear-to-r from-dynamic-purple/10 via-dynamic-blue/5 to-dynamic-cyan/10 p-4">
          <div className="pointer-events-none absolute inset-0">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-bounce opacity-30"
                style={{
                  left: `${(i * 12 + 5) % 100}%`,
                  top: `${(i * 15 + 10) % 100}%`,
                  animationDelay: `${i * 0.15}s`,
                }}
              >
                {i % 3 === 0 ? (
                  <Sparkles className="h-3 w-3 text-dynamic-cyan" />
                ) : i % 3 === 1 ? (
                  <PartyPopper className="h-3 w-3 text-dynamic-purple" />
                ) : (
                  <Trophy className="h-3 w-3 text-dynamic-yellow" />
                )}
              </div>
            ))}
          </div>
          <div className="relative text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <PartyPopper className="h-5 w-5 text-dynamic-purple" />
              <span className="bg-linear-to-r from-dynamic-purple via-dynamic-blue to-dynamic-cyan bg-clip-text font-bold text-lg text-transparent">
                {t('year_end_party.celebration_title')}
              </span>
              <Trophy className="h-5 w-5 text-dynamic-yellow" />
            </div>
            <p className="text-dynamic-purple/70 text-sm">
              {t('year_end_party.celebration_message')}
            </p>
          </div>
        </div>
      ) : (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'h-auto w-full justify-between rounded-xl border border-border/50 bg-muted/20 p-3 hover:bg-muted/40',
                yearInfo.isYearEndPartyPassed && 'opacity-50'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    yearInfo.isYearEndPartyPassed
                      ? 'bg-dynamic-green/15'
                      : 'bg-dynamic-purple/15'
                  )}
                >
                  {yearInfo.isYearEndPartyPassed ? (
                    <Check className="h-4 w-4 text-dynamic-green" />
                  ) : (
                    <PartyPopper className="h-4 w-4 text-dynamic-purple" />
                  )}
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">
                    {t('year_end_party.title')}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('year_end_party.subtitle')}
                  </p>
                </div>
              </div>
              {yearInfo.isYearEndPartyPassed ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-dynamic-green/30 text-[10px] text-dynamic-green"
                >
                  <Check className="h-3 w-3" />
                  {t('year_end_party.completed')}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Clock className="h-3 w-3" />
                  {t('year_end_party.days_until', {
                    count: yearInfo.daysUntilYearEndParty,
                  })}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Trophy className="h-3.5 w-3.5 shrink-0" />
                <span>{t('year_end_party.description')}</span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Company Age */}
      <div className="flex items-center justify-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="cursor-help gap-1.5">
                <Clock className="h-3 w-3" />
                {t('company_age', {
                  years: yearInfo.companyAge.years,
                  months: yearInfo.companyAge.months,
                  days: yearInfo.companyAge.days,
                })}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{t('company_age_tooltip.title')}</p>
              <p className="text-muted-foreground text-xs">
                {t('company_age_tooltip.founded')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
