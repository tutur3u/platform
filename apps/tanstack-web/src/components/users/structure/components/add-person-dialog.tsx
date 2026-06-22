'use client';

import { Button } from '@tuturuuu/ui/button';
import { useMemo, useState } from 'react';
import {
  createStructureTranslator,
  type OrganizationalStructureMessages,
} from '../messages';
import type { Organization, OrganizationalData, Role } from '../types';
import { SelectField, TextInputField } from './form-controls';

interface AddPersonDialogProps {
  open: boolean;
  onClose: () => void;
  data: OrganizationalData;
  messages: OrganizationalStructureMessages;
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
  messages,
  onAdd,
}: AddPersonDialogProps) {
  const t = createStructureTranslator(messages);

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

  const isValid = Boolean(fullName.trim() && email.trim() && roleId && orgId);

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
          <TextInputField
            id="full_name"
            label={t('full_name')}
            value={fullName}
            onValueChange={setFullName}
            placeholder={t('full_name')}
          />
          <TextInputField
            id="email"
            label={t('email')}
            type="email"
            value={email}
            onValueChange={setEmail}
            placeholder="name@company.com"
          />
          <TextInputField
            id="photo_url"
            label={t('photo_url')}
            value={photoUrl}
            onValueChange={setPhotoUrl}
            placeholder="https://..."
          />

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              id="role"
              label={t('role')}
              value={roleId}
              onValueChange={setRoleId}
            >
              <option value="" disabled>
                {t('select_role')}
              </option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="organization"
              label={t('organization')}
              value={orgId}
              onValueChange={setOrgId}
            >
              <option value="" disabled>
                {t('select_organization')}
              </option>
              {orgs.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </SelectField>
          </div>

          <SelectField
            id="employment_type"
            label={t('employment_type')}
            value={employmentType}
            onValueChange={(value) =>
              setEmploymentType(
                value as 'full_time' | 'part_time' | 'contracted'
              )
            }
          >
            <option value="full_time">{t('full_time')}</option>
            <option value="part_time">{t('part_time')}</option>
            <option value="contracted">{t('contracted')}</option>
          </SelectField>
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
