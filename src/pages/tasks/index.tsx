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
    <div className="w-full h-full relative flex">
      <div className="h-[50rem] w-[15rem] flex flex-col gap-2 top-0 left-0 bg-zinc-900 p-3 overflow-scroll scrollbar-none scroll-smooth">
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
      <div className="px-7 w-full">
        <div className="text-3xl font-semibold text-center w-full">
          Project name
        </div>
        <div className="flex gap-6 p-2 border-b border-zinc-800/80 ">
          <div className="hover:bg-zinc-900 p-2 rounded-lg hover:cursor-pointer">
            Board
          </div>
          <div className="hover:bg-zinc-900 p-2 rounded-lg hover:cursor-pointer">
            Table
          </div>
          <div className="hover:bg-zinc-900 p-2 rounded-lg hover:cursor-pointer">
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
