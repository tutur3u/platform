'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { Organization, OrganizationalData, Role } from '../types';

interface AddPersonDialogProps {
  open: boolean;
  onClose: () => void;
  data: OrganizationalData;
  onAdd: (params: {
    fullName: string;
    email: string;
    photoUrl: string;
    roleId: string;
    organizationId: string;
    employmentType: 'full_time' | 'part_time' | 'contracted';
  }) => void;
}

export function AddPersonDialog({
  open,
  onClose,
  data,
  onAdd,
}: AddPersonDialogProps) {
  const t = useTranslations('organizational_structure');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [roleId, setRoleId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [employmentType, setEmploymentType] = useState<
    'full_time' | 'part_time' | 'contracted'
  >('full_time');

  const roles = useMemo<Role[]>(() => data.roles, [data.roles]);
  const orgs = useMemo<Organization[]>(
    () => data.organizations,
    [data.organizations]
  );

  const isValid = fullName.trim() && email.trim() && roleId && orgId;

  const submit = () => {
    if (!isValid) return;
    onAdd({
      fullName: fullName.trim(),
      email: email.trim(),
      photoUrl: photoUrl.trim(),
      roleId,
      organizationId: orgId,
      employmentType,
    });
    setFullName('');
    setEmail('');
    setPhotoUrl('');
    setRoleId('');
    setOrgId('');
    setEmploymentType('full_time');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-lg">
            {t('add_person')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="full_name"
              className="mb-1 block text-muted-foreground text-sm"
            >
              {t('full_name')}
            </label>
            <input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('full_name')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-muted-foreground text-sm"
            >
              {t('email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="photo_url"
              className="mb-1 block text-muted-foreground text-sm"
            >
              {t('photo_url')}
            </label>
            <input
              id="photo_url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="role"
                className="mb-1 block text-muted-foreground text-sm"
              >
                {t('role')}
              </label>
              <select
                id="role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  {t('select_role')}
                </option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="organization"
                className="mb-1 block text-muted-foreground text-sm"
              >
                {t('organization')}
              </label>
              <select
                id="organization"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  {t('select_organization')}
                </option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="employment_type"
              className="mb-1 block text-muted-foreground text-sm"
            >
              {t('employment_type')}
            </label>
            <select
              id="employment_type"
              value={employmentType}
              onChange={(e) =>
                setEmploymentType(
                  e.target.value as 'full_time' | 'part_time' | 'contracted'
                )
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="full_time">{t('full_time')}</option>
              <option value="part_time">{t('part_time')}</option>
              <option value="contracted">{t('contracted')}</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={!isValid}>
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
