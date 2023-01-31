import { AppProps } from "next/app";
import { PageWithLayoutProps } from "./PageWithLayoutProps";

export type AppWithLayoutProps = AppProps & {
  Component: PageWithLayoutProps;
};
