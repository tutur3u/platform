"use client";

import { SidebarStructure } from "@tuturuuu/satellite/sidebar-structure";
import { ChatSidebarPanel } from "@tuturuuu/ui/chat/chat-sidebar-panel";
import type { NavLink } from "@tuturuuu/ui/custom/navigation";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { TTR_URL } from "@/constants/common";
import { ChatScopeTabs, useChatScope } from "./chat-scope-tabs";
import { WorkspaceSelect } from "./workspace-select";

interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  currentUserId: string;
  defaultCollapsed: boolean;
  disableCreateNewWorkspace?: boolean;
  links: (NavLink | null)[];
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  wsId: string;
}

export function Structure({
  actions,
  children,
  currentUserId,
  defaultCollapsed = false,
  disableCreateNewWorkspace,
  links,
  userPopover,
  workspace,
  wsId,
}: StructureProps) {
  return (
    <SidebarStructure
      actions={actions}
      brand={
        <>
          <Image
            alt=""
            className="h-6 w-6"
            height={32}
            src="/media/logos/transparent.png"
            width={32}
          />
          <ChatScopeTabs />
        </>
      }
      collapsedBrand={
        <Image
          alt=""
          className="h-7 w-7"
          height={32}
          src="/media/logos/transparent.png"
          width={32}
        />
      }
      defaultCollapsed={defaultCollapsed}
      linkBrand={false}
      links={links}
      mobileBrand={
        <Link
          aria-label="Home"
          className="flex flex-none items-center gap-2"
          href="/"
        >
          <Image
            alt=""
            className="h-8 w-8"
            height={32}
            src="/media/logos/transparent.png"
            width={32}
          />
        </Link>
      }
      mobileHeaderDivider={false}
      sidebarContentAfter={({ closeOnMobile, isCollapsed }) => (
        <ChatSidebarPanel
          closeOnMobile={closeOnMobile}
          currentUserId={currentUserId}
          isCollapsed={isCollapsed}
          wsId={wsId}
        />
      )}
      stackWorkspaceSelect
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
      userPopover={userPopover}
      workspace={workspace}
      workspaceSelect={({ isCollapsed }) => (
        <ChatWorkspaceSelectGate
          disableCreateNewWorkspace={disableCreateNewWorkspace}
          hideLeading={isCollapsed}
          wsId={wsId}
        />
      )}
      wsId={wsId}
    >
      {children}
    </SidebarStructure>
  );
}

function ChatWorkspaceSelectGate({
  disableCreateNewWorkspace,
  hideLeading,
  wsId,
}: {
  disableCreateNewWorkspace?: boolean;
  hideLeading: boolean;
  wsId: string;
}) {
  const scope = useChatScope();

  if (scope !== "workspaces") return null;

  return (
    <WorkspaceSelect
      disableCreateNewWorkspace={disableCreateNewWorkspace}
      hideLeading={hideLeading}
      wsId={wsId}
    />
  );
}
