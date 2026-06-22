'use client';

import {
  createStructureTranslator,
  type OrganizationalStructureMessages,
} from '../messages';
import { findById } from '../mock-data';
import type { EmploymentHistory, OrganizationalData } from '../types';
import { EmploymentHistoryList } from './employment-history-list';
import {
  SalaryHistoryChart,
  type SalaryHistoryPoint,
} from './salary-history-chart';

interface EmployeeDetailsPanelProps {
  selectedEmployee: EmploymentHistory | null;
  data: OrganizationalData;
  messages: OrganizationalStructureMessages;
}

export function EmployeeDetailsPanel({
  selectedEmployee,
  data,
  messages,
}: EmployeeDetailsPanelProps) {
  const t = createStructureTranslator(messages);

  if (!selectedEmployee) {
    return null;
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

  // Prepare chart data
  const chartData: SalaryHistoryPoint[] = personHistory.map((h, index) => {
    const r = findById(data.roles, h.role_id);
    const o = findById(data.organizations, h.organization_id);
    return {
      period: `${r?.name} at ${o?.name}`,
      salary: h.salary,
      date: h.start_date,
      index,
    };
  });

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

  return (
    <div className="rounded-xl border border-foreground/10 bg-background/50 p-4 shadow-sm backdrop-blur-xl">
      {/* Profile Header */}
      <div className="text-center">
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
            <SalaryHistoryChart data={chartData} />
          </div>
        </div>
      )}

      <EmploymentHistoryList
        data={data}
        messages={messages}
        personHistory={personHistory}
        selectedEmployeeId={selectedEmployee.id}
      />
    </div>
  );
}
