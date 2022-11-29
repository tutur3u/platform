import { NavLink } from '@mantine/core';
import { ReactElement, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { useAppearance } from '../../hooks/useAppearance';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';

const TasksPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment({
      content: 'Tasks',
      href: '/tasks',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-full w-full">
      <div className="top-0 left-0 flex h-[50rem] w-[15rem] flex-col gap-2 overflow-scroll scroll-smooth bg-zinc-900 p-3 scrollbar-none">
        <NavLink label="Favourite projects" childrenOffset={28} defaultOpened>
          <NavLink label="Project 1" />
          <NavLink label="Project 2" />
          <NavLink label="Project 3" />
        </NavLink>
        <NavLink label="All projects">
          <NavLink label="Org 1" childrenOffset={28} defaultOpened>
            <NavLink label="Project 1" />
            <NavLink label="Project 2" />
            <NavLink label="Project 3" />
          </NavLink>
          <NavLink label="Org 2" childrenOffset={28} defaultOpened>
            <NavLink label="Project 1" />
            <NavLink label="Project 2" />
            <NavLink label="Project 3" />
          </NavLink>
        </NavLink>
        <NavLink label="Archive">
          <NavLink label="Org 1" childrenOffset={28} defaultOpened>
            <NavLink label="Project 1" />
            <NavLink label="Project 2" />
            <NavLink label="Project 3" />
          </NavLink>
          <NavLink label="Org 2" childrenOffset={28} defaultOpened>
            <NavLink label="Project 1" />
            <NavLink label="Project 2" />
            <NavLink label="Project 3" />
          </NavLink>
        </NavLink>
      </div>
      <div className="w-full px-7">
        <div className="w-full text-center text-3xl font-semibold">
          Project name
        </div>
        <div className="flex gap-6 border-b border-zinc-800/80 p-2 ">
          <div className="rounded-lg p-2 hover:cursor-pointer hover:bg-zinc-900">
            Board
          </div>
          <div className="rounded-lg p-2 hover:cursor-pointer hover:bg-zinc-900">
            Table
          </div>
          <div className="rounded-lg p-2 hover:cursor-pointer hover:bg-zinc-900">
            List view
          </div>
        </div>
      </div>
    </div>
  );
};

TasksPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default TasksPage;
