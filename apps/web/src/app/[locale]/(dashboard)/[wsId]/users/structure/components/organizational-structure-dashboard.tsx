'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MOCK_DATA } from '../mock-data';
import type {
  EmploymentHistory,
  Organization,
  OrganizationalData,
} from '../types';
import { AddPersonDialog } from './add-person-dialog';
import { EmployeeDetailsPanel } from './employee-details-panel';
import { ManageGroupsDialog } from './manage-groups-dialog';
import { ManageRelationsDialog } from './manage-relations-dialog';
import { OrgChartCanvas } from './org-chart-canvas';

interface OrganizationalStructureDashboardProps {
  wsId: string;
  locale: string;
}

export function OrganizationalStructureDashboard({
  wsId: _wsId,
  locale: _locale,
}: OrganizationalStructureDashboardProps) {
  const t = useTranslations('organizational_structure');
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmploymentHistory | null>(null);
  const [data, setData] = useState<OrganizationalData>(MOCK_DATA);
  const [addOpen, setAddOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [relationsOpen, setRelationsOpen] = useState(false);

  const handleEmployeeSelect = (employmentId: string) => {
    const employment = data.employment_history.find(
      (e) => e.id === employmentId
    );
    if (employment) {
      setSelectedEmployee(employment);
    }
  };

  const handleAddPerson = (params: {
    fullName: string;
    email: string;
    photoUrl: string;
    roleId: string;
    organizationId: string;
    employmentType: 'full_time' | 'part_time' | 'contracted';
  }) => {
    const personId = `p_${Date.now()}`;
    const employmentId = `eh_${Date.now()}`;
    setData((prev) => ({
      ...prev,
      people: [
        ...prev.people,
        {
          id: personId,
          fullName: params.fullName,
          email: params.email,
          photoUrl:
            params.photoUrl ||
            `https://placehold.co/100x100/ccfbf1/1e293b?text=${encodeURIComponent(
              params.fullName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
            )}`,
        },
      ],
      employment_history: [
        ...prev.employment_history,
        {
          id: employmentId,
          person_id: personId,
          role_id: params.roleId,
          organization_id: params.organizationId,
          salary: 0,
          start_date: new Date().toISOString().slice(0, 10),
          end_date: null,
          type: params.employmentType,
          is_current: true,
        },
      ],
    }));
  };

  const handleSaveGroups = (orgs: Organization[]) => {
    setData((prev) => ({ ...prev, organizations: orgs }));
  };

  const handleSaveRelations = (params: {
    supervisors: OrganizationalData['supervisors'];
    collaborations: OrganizationalData['collaborations'];
  }) => {
    setData((prev) => ({
      ...prev,
      supervisors: params.supervisors,
      collaborations: params.collaborations,
    }));
  };

  return (
    <div className="-m-4">
      <OrgChartCanvas
        data={data}
        onEmployeeSelect={handleEmployeeSelect}
        selectedEmployeeId={selectedEmployee?.id}
      />

      <div className="fixed top-2 right-2 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          {t('add_person')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setGroupsOpen(true)}>
          {t('manage_groups')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRelationsOpen(true)}
        >
          {t('manage_relations')}
        </Button>
      </div>

      <AddPersonDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        data={data}
        onAdd={handleAddPerson}
      />
      <ManageGroupsDialog
        open={groupsOpen}
        onClose={() => setGroupsOpen(false)}
        data={data}
        onSave={handleSaveGroups}
      />
      <ManageRelationsDialog
        open={relationsOpen}
        onClose={() => setRelationsOpen(false)}
        data={data}
        onSave={handleSaveRelations}
      />

      <div className="fixed top-14 right-2">
        <EmployeeDetailsPanel selectedEmployee={selectedEmployee} data={data} />
      </div>
    </div>
  );
}
