import { UserCircleIcon } from '@heroicons/react/24/solid';
import { MultiSelect } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  roles: string[];
  setRoles: (roles: string[]) => void;
  className?: string;
  disabled?: boolean;
}

const MemberRoleMultiSelector = ({
  roles,
  setRoles,
  className,
  disabled,
}: Props) => {
  const { t } = useTranslation('member-roles');

  const data = [
    {
      label: t('common:all'),
      value: '',
      group: t('common:general'),
    },
    {
      label: t('owner'),
      value: 'OWNER',
      group: t('common:other'),
    },
    {
      label: t('admin'),
      value: 'ADMIN',
      group: t('common:other'),
    },
    {
      label: t('member'),
      value: 'MEMBER',
      group: t('common:other'),
    },
  ];

  const handleIdsChange = (ids: string[]) => {
    if (ids.length === 0) return setRoles(['']);

    // Only allow either all, or multiple categories to be selected
    if (ids[0] === '') {
      if (ids.length === 1) {
        // "All" is selected, so clear all other selections
        setRoles(ids);
        return;
      }

      // "All" is not selected, so remove it from the list
      setRoles(ids.filter((id) => id !== ''));
    } else if (ids.length > 1 && ids.includes('')) {
      // Since "All" is selected, remove all other selections
      setRoles(['']);
    } else {
      setRoles(ids);
    }
  };

  return (
    <MultiSelect
      label={t('roles')}
      placeholder={t('select-roles')}
      icon={<UserCircleIcon className="h-5" />}
      data={data}
      value={roles.length > 0 ? roles : ['']}
      onChange={handleIdsChange}
      className={className}
      styles={{
        item: {
          // applies styles to selected item
          '&[data-selected]': {
            '&, &:hover': {
              backgroundColor: '#6b686b',
              color: '#fff',
              fontWeight: 600,
            },
          },

          // applies styles to hovered item
          '&:hover': {
            backgroundColor: '#454345',
            color: '#fff',
          },
        },
      }}
      disabled={disabled}
      searchable
    />
  );
};

export default MemberRoleMultiSelector;
