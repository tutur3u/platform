import type { PublicWorkspaceReferenceRates } from '@tuturuuu/internal-api';
import {
  PLAN_QUOTAS,
  type VersionedPlanTier,
} from '@tuturuuu/utils/plan-quota-policy';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

const tiers: readonly VersionedPlanTier[] = [
  'FREE',
  'PLUS',
  'PRO',
  'MAX',
  'ULTRA',
];

type ComparisonCopy = {
  title: string;
  feature: string;
  credits: string;
  voice: string;
  boards: string;
  storage: string;
  meetings: string;
  transcription: string;
  forms: string;
  automation: string;
  allowance: string;
  model: string;
  modelRates: string;
  multiplier: string;
  exampleTokens: string;
  exampleCredits: string;
};

export function VersionedPlanComparison({
  copy,
  locale,
  names,
  referenceRates,
}: {
  copy: ComparisonCopy;
  locale: string;
  names: Readonly<Record<VersionedPlanTier, string>>;
  referenceRates: PublicWorkspaceReferenceRates | null;
}) {
  const rows = [
    {
      title: copy.credits,
      value: (quota: (typeof PLAN_QUOTAS)[VersionedPlanTier]) =>
        quota.monthlyAiCredits.credits,
    },
    {
      title: copy.voice,
      value: (quota: (typeof PLAN_QUOTAS)[VersionedPlanTier]) =>
        quota.privateVoiceMonthlySeconds / 60,
    },
    {
      title: copy.boards,
      value: (quota: (typeof PLAN_QUOTAS)[VersionedPlanTier]) =>
        quota.taskBoardsPerWorkspace,
    },
    {
      title: copy.storage,
      value: (quota: (typeof PLAN_QUOTAS)[VersionedPlanTier]) => quota.driveGiB,
    },
    {
      title: copy.meetings,
      value: (quota: (typeof PLAN_QUOTAS)[VersionedPlanTier]) =>
        quota.meetMonthlyParticipantMinutes,
    },
    {
      title: copy.transcription,
      value: (quota: (typeof PLAN_QUOTAS)[VersionedPlanTier]) =>
        quota.meetMonthlyTranscribedAudioMinutes,
    },
    {
      title: copy.forms,
      value: (quota: (typeof PLAN_QUOTAS)[VersionedPlanTier]) =>
        quota.monthlyFormSubmissions,
    },
    {
      title: copy.automation,
      value: (quota: (typeof PLAN_QUOTAS)[VersionedPlanTier]) =>
        quota.monthlyStandardAutomationRuns,
    },
  ];

  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });

  return (
    <div className="space-y-6">
      <Table>
        <TableCaption>
          <span className="font-medium">{copy.title}</span>
          <span className="mt-1 block">{copy.allowance}</span>
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{copy.feature}</TableHead>
            {tiers.map((tier) => (
              <TableHead key={tier} scope="col">
                {names[tier]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ title, value }) => (
            <TableRow key={title}>
              <TableHead scope="row">{title}</TableHead>
              {tiers.map((tier) => (
                <TableCell key={tier}>
                  {format.format(value(PLAN_QUOTAS[tier]))}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {referenceRates && (
        <Table>
          <TableCaption>
            {copy.modelRates} · {referenceRates.revision}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{copy.model}</TableHead>
              <TableHead scope="col">{copy.multiplier}</TableHead>
              <TableHead scope="col">{copy.exampleTokens}</TableHead>
              <TableHead scope="col">{copy.exampleCredits}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referenceRates.rates.map((rate) => (
              <TableRow key={rate.modelId}>
                <TableHead scope="row">{rate.modelId}</TableHead>
                <TableCell>
                  {format.format(rate.multiplierBasisPoints / 10_000)}×
                </TableCell>
                <TableCell>
                  {format.format(rate.exampleInputTokens)} /{' '}
                  {format.format(rate.exampleOutputTokens)}
                </TableCell>
                <TableCell>{format.format(rate.exampleCredits)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
