import type { ReactElement, ReactNode } from "react";
import { NextPage } from "next";

export type PageWithLayoutProps<P = unknown, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};
