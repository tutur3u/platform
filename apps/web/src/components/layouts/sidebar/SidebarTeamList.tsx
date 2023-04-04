import { Avatar, Divider } from '@mantine/core';
import React from 'react';
import { getInitials } from '../../../utils/name-helper';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';
import SidebarLink from '../SidebarLink';
import { useWorkspaces } from '../../../hooks/useWorkspaces';

interface Props {
  wsId: string;
  sidebarOpened: boolean;
}

const SidebarTeamList = ({ wsId, sidebarOpened }: Props) => {
  const { teams, teamsLoading } = useWorkspaces();

  return (
    <div className="m-2">
      {teamsLoading || (
        <div className={`flex flex-col ${sidebarOpened ? 'gap-1' : 'gap-2'}`}>
          {(teams?.length || 0) > 0 && <Divider />}
          {teams &&
            teams.map((team) => (
              <SidebarLink
                key={team.id}
                href={`/${wsId}/teams/${team.id}`}
                defaultHighlight={sidebarOpened}
                activeIcon={
                  <Avatar
                    radius="sm"
                    color="blue"
                    className="bg-blue-500/20"
                    size={sidebarOpened ? 'sm' : 'md'}
                  >
                    {team?.name ? (
                      getInitials(team.name)
                    ) : (
                      <BuildingOffice2Icon className="w-5" />
                    )}
                  </Avatar>
                }
                inactiveIcon={
                  <Avatar
                    radius="sm"
                    color="blue"
                    className="hover:bg-blue-500/10"
                    size={sidebarOpened ? 'sm' : 'md'}
                  >
                    {team?.name ? (
                      getInitials(team.name)
                    ) : (
                      <BuildingOffice2Icon className="w-5" />
                    )}
                  </Avatar>
                }
                label={team?.name || 'Untitled Team'}
                showTooltip={!sidebarOpened}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export default SidebarTeamList;
