'use client';

import type {
  InfrastructureStressTestProfile,
  InfrastructureStressTestTarget,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

export function StressTestRunFields({
  concurrency,
  durationSeconds,
  maxRequestsPerSecond,
  path,
  profiles,
  selectedProfile,
  selectedProfileId,
  selectedTargetId,
  setConcurrency,
  setDurationSeconds,
  setMaxRequestsPerSecond,
  setPath,
  setProfileId,
  setTargetId,
  targets,
}: {
  concurrency: string;
  durationSeconds: string;
  maxRequestsPerSecond: string;
  path: string;
  profiles: InfrastructureStressTestProfile[];
  selectedProfile?: InfrastructureStressTestProfile;
  selectedProfileId: string;
  selectedTargetId: string;
  setConcurrency: (value: string) => void;
  setDurationSeconds: (value: string) => void;
  setMaxRequestsPerSecond: (value: string) => void;
  setPath: (value: string) => void;
  setProfileId: (value: string) => void;
  setTargetId: (value: string) => void;
  targets: InfrastructureStressTestTarget[];
}) {
  const t = useTranslations('blue-green-monitoring.stress_tests');

  return (
    <>
      <Select value={selectedTargetId} onValueChange={setTargetId}>
        <SelectTrigger>
          <SelectValue placeholder={t('form.target')} />
        </SelectTrigger>
        <SelectContent>
          {targets.map((target) => (
            <SelectItem key={target.id} value={target.id}>
              {target.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedProfileId} onValueChange={setProfileId}>
        <SelectTrigger>
          <SelectValue placeholder={t('form.profile')} />
        </SelectTrigger>
        <SelectContent>
          {profiles.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              {profile.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        onChange={(event) => setPath(event.target.value)}
        placeholder={t('form.path')}
        value={path}
      />

      <div className="grid grid-cols-3 gap-2">
        <Input
          aria-label="Concurrency"
          inputMode="numeric"
          min={1}
          onChange={(event) => setConcurrency(event.target.value)}
          placeholder={String(selectedProfile?.concurrency ?? '')}
          type="number"
          value={concurrency}
        />
        <Input
          aria-label="Maximum requests per second"
          inputMode="numeric"
          min={1}
          onChange={(event) => setMaxRequestsPerSecond(event.target.value)}
          placeholder={String(selectedProfile?.maxRequestsPerSecond ?? '')}
          type="number"
          value={maxRequestsPerSecond}
        />
        <Input
          aria-label="Duration seconds"
          inputMode="numeric"
          min={1}
          onChange={(event) => setDurationSeconds(event.target.value)}
          placeholder={String(selectedProfile?.durationSeconds ?? '')}
          type="number"
          value={durationSeconds}
        />
      </div>
    </>
  );
}
