'use client';

import { GoalsInput } from './components/form/GoalsInput';
import { PlanView } from './components/plan/PlanView';
import { AdvancedSettings, YearPlan } from './types';
import { useObject } from '@repo/ai/object/core';
import { yearPlanSchema } from '@repo/ai/object/types';

export default function SparkClientPage({ wsId }: { wsId: string }) {
  const {
    object,
    submit,
    isLoading,
    error: objectError,
  } = useObject({
    api: '/api/ai/objects/year-plan',
    schema: yearPlanSchema,
  });

  const handleGeneratePlan = async (
    goals: string[],
    settings: AdvancedSettings
  ) => {
    submit({
      wsId,
      goals,
      ...settings,
    });
  };

  return (
    <div className="container space-y-8 py-8">
      <GoalsInput
        onSubmit={handleGeneratePlan}
        isLoading={isLoading}
        error={objectError}
      />

      {object?.yearPlan && (
        <PlanView
          yearPlan={object.yearPlan as Partial<YearPlan>}
          isLoading={isLoading}
          planDuration={12}
        />
      )}
    </div>
  );
}
