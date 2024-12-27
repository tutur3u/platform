import Header from "./header";
import React from "react";
import Footer from "@/components/Footer";

interface LayoutProps{
    children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    return (
      <>
        <Header></Header>
        <div id="main-content" className="flex flex-col pt-[53px]">
          {children}
        </div>
        <Footer></Footer>
      </>
    );
  }
  