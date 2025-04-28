'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  HelpCircle,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import {
  calculatePercentage,
  formatScore,
} from '@tuturuuu/utils/nova/scores/calculate';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import * as z from 'zod';

const ScoreSchema = z.object({
  total_tests: z.coerce.number().int().min(0).optional(),
  passed_tests: z.coerce.number().int().min(0).optional(),
  total_criteria: z.coerce.number().int().min(0).optional(),
  sum_criterion_score: z.coerce.number().min(0).optional(),
});

export default function ScoreCalculatorPage() {
  const t = useTranslations('score-calculator');

  const form = useForm<z.infer<typeof ScoreSchema>>({
    resolver: zodResolver(ScoreSchema),
    defaultValues: {
      total_tests: undefined,
      passed_tests: undefined,
      total_criteria: undefined,
      sum_criterion_score: undefined,
    },
    mode: 'onChange',
  });

  const formValues = form.watch();

  const totalTests = formValues.total_tests;
  const passedTests = formValues.passed_tests;
  const totalCriteria = formValues.total_criteria;
  const sumCriterionScore = formValues.sum_criterion_score;

  const result = calculateScoreResult(formValues);

  function calculateScoreResult(values: z.infer<typeof ScoreSchema>) {
    const totalTests = values.total_tests || 0;
    const passedTests = values.passed_tests || 0;
    const totalCriteria = values.total_criteria || 0;
    const sumCriterionScore = values.sum_criterion_score || 0;

    // Don't calculate if all values are empty
    if (
      totalTests === 0 &&
      passedTests === 0 &&
      totalCriteria === 0 &&
      sumCriterionScore === 0
    ) {
      return null;
    }

    const hasCriteria = totalCriteria > 0;
    const hasTests = totalTests > 0;

    // Calculate weights based on which metrics are present
    const testWeight = hasCriteria ? 0.5 : 1.0;
    const criteriaWeight = hasTests ? 0.5 : 1.0;

    let criteriaScore = 0;
    let testScore = 0;

    // Calculate criteria score
    if (hasCriteria) {
      criteriaScore =
        (sumCriterionScore / (totalCriteria * 10)) * 10 * criteriaWeight;
    }

    // Calculate test score
    if (hasTests) {
      testScore = (passedTests / totalTests) * 10 * testWeight;
    }

    const score = criteriaScore + testScore;
    const percentage = calculatePercentage(score, 10);

    return {
      score,
      testScore,
      criteriaScore,
      testWeight,
      criteriaWeight,
      percentage,
    };
  }

  // Add validation to ensure passed tests don't exceed total tests
  useEffect(() => {
    console.log('totalTests', totalTests);
    console.log('passedTests', passedTests);

    // Only correct if passed tests is greater than total tests
    if (
      totalTests !== undefined &&
      passedTests !== undefined &&
      parseInt(passedTests as unknown as string) >
        parseInt(totalTests as unknown as string)
    ) {
      form.setValue('passed_tests', totalTests);
    }
  }, [totalTests, passedTests]); // Remove passedTests from dependency to prevent jumps

  // Add validation to ensure sum of criterion scores doesn't exceed max possible
  useEffect(() => {
    if (
      totalCriteria !== undefined &&
      sumCriterionScore !== undefined &&
      parseInt(sumCriterionScore as unknown as string) >
        parseInt(totalCriteria as unknown as string) * 10
    ) {
      form.setValue('sum_criterion_score', totalCriteria * 10);
    }
  }, [totalCriteria, sumCriterionScore]);

  // Get score color based on percentage
  const getScoreColor = (score: number) => {
    if (score >= 8) return 'green';
    if (score >= 6) return 'blue';
    if (score >= 4) return 'yellow';
    return 'red';
  };

  const scoreColor = result ? getScoreColor(result.score) : 'gray';

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Calculator className="h-7 w-7" />
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-dynamic-blue/20 shadow-sm transition-all duration-200 hover:shadow-md md:sticky md:top-6 md:self-start">
          <CardHeader className="border-dynamic-blue/10 bg-dynamic-blue/5 rounded-t-lg border-b">
            <CardTitle className="text-dynamic-blue">
              {t('input_metrics')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Form {...form}>
              <div className="space-y-6">
                <div className="border-dynamic-sky/20 bg-dynamic-sky/5 rounded-lg border p-5">
                  <h3 className="text-dynamic-sky flex items-center gap-2 text-lg font-medium">
                    <CheckCircle2 className="h-5 w-5" />
                    {t('test_results')}
                  </h3>
                  <Separator className="bg-dynamic-sky/20 my-3" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="total_tests"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-dynamic-sky font-medium">
                            {t('total_tests')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="0"
                              type="number"
                              className="border-dynamic-sky/30 focus-visible:ring-dynamic-sky/30"
                              {...field}
                              min={0}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('total_tests_description')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="passed_tests"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-dynamic-sky font-medium">
                            {t('passed_tests')}
                          </FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                placeholder="0"
                                type="number"
                                className="border-dynamic-sky/30 focus-visible:ring-dynamic-sky/30 pr-14"
                                {...field}
                                min={0}
                                max={formValues.total_tests || 0}
                                disabled={!formValues.total_tests}
                              />
                            </FormControl>
                            {formValues.total_tests ? (
                              <div className="text-muted-foreground absolute inset-y-0 right-0 flex items-center pr-3 text-xs">
                                {t('max')}: {formValues.total_tests || 0}
                              </div>
                            ) : null}
                          </div>
                          <FormDescription>
                            {t('passed_tests_description')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="border-dynamic-purple/20 bg-dynamic-purple/5 rounded-lg border p-5">
                  <h3 className="text-dynamic-purple flex items-center gap-2 text-lg font-medium">
                    <AlertCircle className="h-5 w-5" />
                    {t('criteria_evaluation')}
                  </h3>
                  <Separator className="bg-dynamic-purple/20 my-3" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="total_criteria"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-dynamic-purple font-medium">
                            {t('total_criteria')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="0"
                              type="number"
                              className="border-dynamic-purple/30 focus-visible:ring-dynamic-purple/30"
                              {...field}
                              min={0}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('total_criteria_description')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sum_criterion_score"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-dynamic-purple font-medium">
                            {t('sum_criterion_score')}
                          </FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                placeholder="0"
                                type="number"
                                className="border-dynamic-purple/30 focus-visible:ring-dynamic-purple/30 pr-14"
                                {...field}
                                min={0}
                                max={
                                  formValues.total_criteria
                                    ? formValues.total_criteria * 10
                                    : undefined
                                }
                                disabled={!formValues.total_criteria}
                              />
                            </FormControl>
                            {formValues.total_criteria ? (
                              <div className="text-muted-foreground absolute inset-y-0 right-0 flex items-center pr-3 text-xs">
                                {t('max')}: {formValues.total_criteria * 10}
                              </div>
                            ) : null}
                          </div>
                          <FormDescription>
                            {t('sum_criterion_score_description')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </Form>
          </CardContent>
        </Card>

        <Card className="border-dynamic-green/20 shadow-sm md:sticky md:top-6 md:self-start">
          <CardHeader className="border-dynamic-green/10 bg-dynamic-green/5 rounded-t-lg border-b">
            <CardTitle className="text-dynamic-green">
              {t('score_calculation')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {!result ? (
              <div className="flex h-[300px] flex-col items-center justify-center gap-4 text-center">
                <HelpCircle className="text-dynamic-gray/50 h-16 w-16" />
                <div>
                  <p className="text-lg font-medium">
                    {t('no_calculation_yet')}
                  </p>
                  <p className="text-muted-foreground">
                    {t('fill_form_realtime')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div
                  className={`rounded-lg border-2 border-dynamic-${scoreColor}/20 bg-dynamic-${scoreColor}/5 p-6 text-center shadow-sm transition-all duration-300 hover:shadow-md`}
                >
                  <h3
                    className={`text-lg font-medium text-dynamic-${scoreColor}`}
                  >
                    {t('final_score')}
                  </h3>
                  <div className="mt-3 text-6xl font-bold">
                    <span className={`text-dynamic-${scoreColor}`}>
                      {formatScore(result.score, 1)}
                    </span>
                    <span className="text-muted-foreground text-xl">/10</span>
                  </div>
                  <p className={`mt-2 font-medium text-dynamic-${scoreColor}`}>
                    {result.percentage.toFixed(1)}% {t('of_maximum_score')}
                  </p>
                </div>

                <div>
                  <h3 className="text-dynamic-green mb-2 text-lg font-medium">
                    {t('calculation_breakdown')}
                  </h3>
                  <Separator className="bg-dynamic-green/20 my-2" />

                  <div className="mt-4 space-y-4">
                    {result.testScore > 0 && (
                      <div className="space-y-1">
                        <p className="text-dynamic-sky font-medium">
                          {t('test_score_component')}:
                        </p>
                        <div className="border-dynamic-sky/20 bg-dynamic-sky/5 rounded-md border p-3 text-sm shadow-sm">
                          <p>{t('test_formula')}</p>
                          <p className="mt-1">
                            = ({formValues.passed_tests || 0} /{' '}
                            {formValues.total_tests || 0}) × 10 ×{' '}
                            {result.testWeight}
                          </p>
                          <p className="text-dynamic-sky mt-1 font-medium">
                            = {formatScore(result.testScore, 2)} {t('points')}
                          </p>
                        </div>
                      </div>
                    )}

                    {result.criteriaScore > 0 && (
                      <div className="space-y-1">
                        <p className="text-dynamic-purple font-medium">
                          {t('criteria_score_component')}:
                        </p>
                        <div className="border-dynamic-purple/20 bg-dynamic-purple/5 rounded-md border p-3 text-sm shadow-sm">
                          <p>{t('criteria_formula')}</p>
                          <p className="mt-1">
                            = ({formValues.sum_criterion_score || 0} / (
                            {formValues.total_criteria || 0} × 10)) × 10 ×{' '}
                            {result.criteriaWeight}
                          </p>
                          <p className="text-dynamic-purple mt-1 font-medium">
                            = {formatScore(result.criteriaScore, 2)}{' '}
                            {t('points')}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <p className="text-dynamic-green font-medium">
                        {t('final_score_calculation')}:
                      </p>
                      <div className="border-dynamic-green/20 bg-dynamic-green/5 rounded-md border p-3 text-sm shadow-sm">
                        <p>{t('final_formula')}</p>
                        <p className="mt-1">
                          = {formatScore(result.testScore, 2)} +{' '}
                          {formatScore(result.criteriaScore, 2)}
                        </p>
                        <p className="text-dynamic-green mt-1 font-medium">
                          = {formatScore(result.score, 2)} {t('points')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-dynamic-green mb-2 text-lg font-medium">
                    {t('scoring_rules')}
                  </h3>
                  <Separator className="bg-dynamic-green/20 my-2" />
                  <ul className="border-dynamic-green/10 bg-dynamic-green/5 list-inside list-disc space-y-2 rounded-md border p-4 text-sm">
                    <li>{t('rule_1')}</li>
                    <li>{t('rule_2')}</li>
                    <li>{t('rule_3')}</li>
                    <li>{t('rule_4')}</li>
                    <li>{t('rule_5')}</li>
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
