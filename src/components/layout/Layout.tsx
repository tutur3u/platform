import Navbar from './Navbar';
import React, { FC } from 'react';
import Sidebar from './Sidebar';
import { useSidebar } from '../../hooks/useSidebar';
import Footer from './Footer';

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }) => {
    const { isCollapsed } = useSidebar();

    const width = isCollapsed
        ? `w-{calc(100% - 6rem)}`
        : `w-{calc(100% - 16rem)}`;

    const mainCSS = `p-10 flex-1 scrollbar-thin scrollbar-track-zinc-800 scrollbar-thumb-zinc-700 overflow-x-hidden ${width} ${
        isCollapsed ? 'md:ml-[6rem]' : 'md:ml-[16rem]'
    }`;

    const sidebarCSS = isCollapsed
        ? 'hidden md:block md:w-[4rem]'
        : 'w-screen md:w-[16rem]';

    const navbarCSS = `overflow-x-hidden ${width} ${
        isCollapsed ? 'md:pl-[5rem]' : 'md:pl-[17rem]'
    } `;

    return (
        <div className="flex w-full h-screen min-h-screen">
            <Sidebar className={sidebarCSS} />
            <div className="w-full min-h-full flex flex-col">
                <Navbar className={navbarCSS} />
                <div className="bg-[#111113] flex h-full flex-col">
                    <main className={mainCSS}>{children}</main>
                    <Footer className={navbarCSS} />
                </div>
            </div>
        </div>
    );
};

export default Layout;
