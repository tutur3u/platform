import type { OrganizationalStructureMessages } from '../messages';
import { createStructureTranslator } from '../messages';
import { findById } from '../mock-data';
import type { EmploymentHistory, OrganizationalData } from '../types';

interface EmploymentHistoryListProps {
  data: OrganizationalData;
  messages: OrganizationalStructureMessages;
  personHistory: EmploymentHistory[];
  selectedEmployeeId: string;
}

export function EmploymentHistoryList({
  data,
  messages,
  personHistory,
  selectedEmployeeId,
}: EmploymentHistoryListProps) {
  const t = createStructureTranslator(messages);
  const reviews = data.performance_reviews
    .filter((review) => review.employment_id === selectedEmployeeId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="mt-6">
      <h4 className="mb-2 font-bold">{t('employment_history')}</h4>
      <div className="space-y-4">
        {personHistory.map((history) => {
          const role = findById(data.roles, history.role_id);
          const organization = findById(
            data.organizations,
            history.organization_id
          );
          const employmentReviews = reviews.filter(
            (review) => review.employment_id === history.id
          );

          return (
            <div key={history.id} className="border-b pb-4 last:border-b-0">
              <div className="mb-2">
                <p className="font-semibold">{role?.name}</p>
                <p className="text-muted-foreground text-sm">
                  {organization?.name}
                </p>
                <p className="text-muted-foreground text-xs">
                  {history.start_date} to {history.end_date || 'Present'}
                </p>
              </div>

              {employmentReviews.length > 0 && (
                <div className="space-y-2">
                  {employmentReviews.map((review) => (
                    <div
                      key={review.id}
                      className={`rounded-lg border-l-4 p-3 ${reviewOutcomeClassName(
                        review.outcome
                      )}`}
                    >
                      <p className="text-muted-foreground text-xs">
                        {review.date}
                      </p>
                      <p className="text-sm">{review.notes}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function reviewOutcomeClassName(outcome: string) {
  switch (outcome) {
    case 'positive':
      return 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green';
    case 'negative':
      return 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red';
    default:
      return 'border-dynamic-slate/20 bg-dynamic-slate/10 text-dynamic-slate';
  }
}
