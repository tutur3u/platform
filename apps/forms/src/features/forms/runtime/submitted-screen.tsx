'use client';

import { Check, Mail } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { CSSProperties } from 'react';
import { FORM_FONT_VARIABLES } from '../fonts';
import { FormsMarkdown } from '../forms-markdown';
import type { FormDefinition } from '../types';
import { SUPPORT_EMAIL } from './constants';
import { FormBrandFooter } from './form-brand-footer';
import type { FormsTranslator, FormToneClasses } from './types';

export function renderSubmittedScreen({
  form,
  t,
  className,
  toneClasses,
  bodyFontStyle,
  headlineFontStyle,
  displayTypographyClassName,
  bodyTypographyClassName,
  submittedResponseCopyEmail,
  submittedResponseCopyRequested,
  submittedResponseCopyStatus,
}: {
  form: FormDefinition;
  t: FormsTranslator;
  className?: string;
  toneClasses: FormToneClasses;
  bodyFontStyle: CSSProperties;
  headlineFontStyle: CSSProperties;
  displayTypographyClassName: string;
  bodyTypographyClassName: string;
  submittedResponseCopyEmail: string | null;
  submittedResponseCopyRequested: boolean;
  submittedResponseCopyStatus: 'sent' | 'rate_limited' | 'failed' | null;
}) {
  return (
    <div
      className={cn(
        'flex min-h-screen items-center justify-center px-4 py-10',
        FORM_FONT_VARIABLES,
        toneClasses.pageClassName,
        className
      )}
      style={bodyFontStyle}
    >
      <div className="relative w-full max-w-2xl">
        {/* Subtle ambient glows */}
        <div
          className={cn(
            'absolute -top-24 -left-24 h-64 w-64 rounded-full opacity-10 blur-[80px]',
            toneClasses.progressIndicatorClassName
          )}
        />
        <div
          className={cn(
            'absolute -right-24 -bottom-24 h-64 w-64 rounded-full opacity-10 blur-[80px]',
            toneClasses.progressIndicatorClassName
          )}
        />

        <Card
          className={cn(
            'relative overflow-hidden border-0 shadow-2xl',
            toneClasses.cardClassName
          )}
        >
          <div
            className={cn(
              'absolute inset-x-0 top-0 h-1.5',
              toneClasses.progressIndicatorClassName
            )}
          />
          <CardContent className="flex flex-col items-center space-y-8 p-10 text-center sm:p-16">
            <div
              className={cn(
                'flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-background/50 shadow-lg transition-transform duration-500 hover:scale-110',
                toneClasses.iconClassName
              )}
            >
              <Check className="h-10 w-10 stroke-[2.5]" />
            </div>

            <div className="space-y-4">
              <h2
                className={cn(
                  'font-bold tracking-tight',
                  displayTypographyClassName
                )}
                style={headlineFontStyle}
              >
                {form.settings.confirmationTitle || t('runtime.form_submitted')}
              </h2>
              <div
                className={cn(
                  'mx-auto max-w-md text-muted-foreground leading-relaxed',
                  bodyTypographyClassName
                )}
              >
                <FormsMarkdown
                  content={
                    form.settings.confirmationMessage ||
                    t('runtime.form_submitted_description')
                  }
                />
              </div>
            </div>

            {submittedResponseCopyRequested ? (
              <div
                className={cn(
                  'w-full max-w-lg rounded-[1.6rem] border px-5 py-4 text-left',
                  submittedResponseCopyEmail
                    ? 'border-dynamic-green/20 bg-dynamic-green/8'
                    : 'border-dynamic-orange/20 bg-dynamic-orange/10'
                )}
              >
                <div className="flex items-start gap-3">
                  <Mail
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      submittedResponseCopyEmail
                        ? 'text-dynamic-green'
                        : 'text-dynamic-orange'
                    )}
                  />
                  <div className="space-y-1">
                    <p className="font-medium text-sm">
                      {submittedResponseCopyEmail
                        ? t('runtime.response_copy_sent_title')
                        : submittedResponseCopyStatus === 'rate_limited'
                          ? t('runtime.response_copy_not_sent_title')
                          : t('runtime.response_copy_delivery_help_title')}
                    </p>
                    <p className="text-muted-foreground text-sm leading-6">
                      {submittedResponseCopyEmail
                        ? t('runtime.response_copy_sent_description', {
                            email: submittedResponseCopyEmail,
                          })
                        : submittedResponseCopyStatus === 'rate_limited'
                          ? t('runtime.response_copy_rate_limited_description')
                          : submittedResponseCopyStatus === 'failed'
                            ? t('runtime.response_copy_failed_description')
                            : t('runtime.response_copy_support_note', {
                                email: SUPPORT_EMAIL,
                              })}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="pt-4">
              <Button
                variant="outline"
                size="lg"
                className={cn(
                  'h-12 rounded-full px-8 font-medium transition-all hover:bg-foreground/5 hover:shadow-sm active:scale-95',
                  toneClasses.secondaryButtonClassName
                )}
                onClick={() => window.location.reload()}
              >
                {t('runtime.submit_another')}
              </Button>
            </div>

            <FormBrandFooter className="mt-2" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
