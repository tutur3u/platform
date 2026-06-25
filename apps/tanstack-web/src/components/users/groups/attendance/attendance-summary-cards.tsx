'use client';

import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

type AttendanceSummaryCardsProps = {
  absent: number;
  late: number;
  notAttended: number;
  present: number;
  total: number;
};

export function AttendanceSummaryCards({
  absent,
  late,
  notAttended,
  present,
  total,
}: AttendanceSummaryCardsProps) {
  const tAtt = useTranslations('ws-user-group-attendance');

  return (
    <Card>
      <CardContent className="py-4">
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCell
            label={tAtt('summary_total')}
            value={total}
            valueClassName="text-foreground"
            wrapperClassName="border-foreground/10 bg-foreground/5"
          />
          <SummaryCell
            label={tAtt('summary_present')}
            labelClassName="text-dynamic-green"
            value={present}
            valueClassName="text-dynamic-green"
            wrapperClassName="border-dynamic-green/20 bg-dynamic-green/10"
          />
          <SummaryCell
            label={tAtt('summary_absent')}
            labelClassName="text-dynamic-red"
            value={absent}
            valueClassName="text-dynamic-red"
            wrapperClassName="border-dynamic-red/20 bg-dynamic-red/10"
          />
          <SummaryCell
            label={tAtt('summary_late')}
            labelClassName="text-dynamic-yellow"
            value={late}
            valueClassName="text-dynamic-yellow"
            wrapperClassName="border-dynamic-yellow/20 bg-dynamic-yellow/10"
          />
          <SummaryCell
            label={tAtt('summary_not_marked')}
            value={notAttended}
            valueClassName="text-foreground/70"
            wrapperClassName="border-foreground/15 bg-foreground/5"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCell({
  label,
  labelClassName = 'text-foreground/60',
  value,
  valueClassName,
  wrapperClassName,
}: {
  label: string;
  labelClassName?: string;
  value: number;
  valueClassName: string;
  wrapperClassName: string;
}) {
  return (
    <div className={`rounded-lg border-2 p-3 ${wrapperClassName}`}>
      <div className={`font-medium text-sm ${labelClassName}`}>{label}</div>
      <div className={`font-bold text-2xl ${valueClassName}`}>{value}</div>
    </div>
  );
}
