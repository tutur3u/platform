'use client';

import { ChartContainer, ChartTooltipContent } from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { findById } from '../mock-data';
import type { EmploymentHistory, OrganizationalData } from '../types';

interface EmployeeDetailsPanelProps {
  selectedEmployee: EmploymentHistory | null;
  data: OrganizationalData;
}

export function EmployeeDetailsPanel({
  selectedEmployee,
  data,
}: EmployeeDetailsPanelProps) {
  const t = useTranslations('organizational_structure');

  if (!selectedEmployee) {
    return null;
    // return (
    //   <div className="rounded-xl bg-foreground/5 p-6 shadow-sm">
    //     <div className="py-12 text-center">
    //       <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground">
    //         <Users className="h-8 w-8" />
    //       </div>
    //       <h3 className="mt-4 font-semibold text-lg">{t('select_person')}</h3>
    //       <p className="mt-1 text-muted-foreground text-sm">
    //         {t('select_person_desc')}
    //       </p>
    //     </div>
    //   </div>
    // );
  }

  const person = findById(data.people, selectedEmployee.person_id);
  const role = findById(data.roles, selectedEmployee.role_id);
  const organization = findById(
    data.organizations,
    selectedEmployee.organization_id
  );

  if (!person || !role || !organization) {
    return (
      <div className="rounded-xl bg-foreground p-6 shadow-sm">
        <div className="py-12 text-center">
          <p className="text-slate-500">{t('error')}</p>
        </div>
      </div>
    );
  }

  // Get employment history for this person
  const personHistory = data.employment_history
    .filter((h) => h.person_id === person.id)
    .sort(
      (a, b) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );

  // Get responsibilities for current role
  const responsibilities = data.role_responsibilities
    .filter((rr) => rr.role_id === selectedEmployee.role_id)
    .map((rr) => findById(data.responsibilities, rr.responsibility_id))
    .filter(Boolean)
    .map((r) => r?.description)
    .filter(Boolean) as string[];

  // Get performance reviews
  const reviews = data.performance_reviews
    .filter((pr) => pr.employment_id === selectedEmployee.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Prepare chart data
  const chartData = personHistory.map((h, index) => {
    const r = findById(data.roles, h.role_id);
    const o = findById(data.organizations, h.organization_id);
    return {
      period: `${r?.name} at ${o?.name}`,
      salary: h.salary,
      date: h.start_date,
      index,
    };
  });

  const chartConfig = {
    salary: {
      label: t('salary'),
    },
  };

  const getEmploymentTypeLabel = (type: string) => {
    switch (type) {
      case 'full_time':
        return t('full_time');
      case 'part_time':
        return t('part_time');
      case 'contracted':
        return t('contracted');
      default:
        return type;
    }
  };

  const getReviewOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'positive':
        return 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green';
      case 'negative':
        return 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red';
      default:
        return 'border-dynamic-slate/20 bg-dynamic-slate/10 text-dynamic-slate';
    }
  };

  return (
    <div className="rounded-xl border border-foreground/10 bg-background/50 p-4 shadow-sm backdrop-blur-xl">
      {/* Profile Header */}
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/** biome-ignore lint/performance/noImgElement: <> */}
        <img
          src={person.photoUrl}
          alt={person.fullName}
          className="mx-auto mb-4 h-24 w-24 rounded-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = 'https://placehold.co/100x100/d1d5db/1e293b?text=??';
          }}
        />
        <h3 className="font-bold text-xl">{person.fullName}</h3>
        <p className="font-semibold text-dynamic-blue text-md">{role.name}</p>
        <p className="text-muted-foreground text-sm">{organization.name}</p>
      </div>

      {/* Basic Information */}
      <div className="mt-6 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="font-semibold text-muted-foreground">
            {t('email')}:
          </span>
          <span>{person.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-semibold text-muted-foreground">
            {t('type')}:
          </span>
          <span className="capitalize">
            {getEmploymentTypeLabel(selectedEmployee.type)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="font-semibold text-muted-foreground">
            {t('salary')}:
          </span>
          <span>${selectedEmployee.salary.toLocaleString()}</span>
        </div>
      </div>

      {/* Key Responsibilities */}
      {responsibilities.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-2 font-bold">{t('key_responsibilities')}</h4>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {responsibilities.map((responsibility) => (
              <li key={responsibility}>{responsibility}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Salary History Chart */}
      {personHistory.length > 1 && (
        <div className="mt-6">
          <h4 className="mb-2 font-bold">{t('salary_history')}</h4>
          <div className="h-64">
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="index"
                    tickFormatter={(value) => `Period ${value + 1}`}
                  />
                  <YAxis
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => [
                          new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          }).format(value as number),
                          name,
                        ]}
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="salary"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--chart-1))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </div>
      )}

      {/* Employment History & Reviews */}
      <div className="mt-6">
        <h4 className="mb-2 font-bold">{t('employment_history')}</h4>
        <div className="space-y-4">
          {personHistory.map((h) => {
            const r = findById(data.roles, h.role_id);
            const o = findById(data.organizations, h.organization_id);
            const employmentReviews = reviews.filter(
              (pr) => pr.employment_id === h.id
            );

            return (
              <div key={h.id} className="border-b pb-4 last:border-b-0">
                <div className="mb-2">
                  <p className="font-semibold">{r?.name}</p>
                  <p className="text-muted-foreground text-sm">{o?.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {h.start_date} to {h.end_date || 'Present'}
                  </p>
                </div>

                {employmentReviews.length > 0 && (
                  <div className="space-y-2">
                    {employmentReviews.map((pr) => (
                      <div
                        key={pr.id}
                        className={`rounded-lg border-l-4 p-3 ${getReviewOutcomeColor(pr.outcome)}`}
                      >
                        <p className="text-muted-foreground text-xs">
                          {pr.date}
                        </p>
                        <p className="text-sm">{pr.notes}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
