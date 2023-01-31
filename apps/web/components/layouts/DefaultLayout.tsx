import Image from "next/image";
import { FC } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }: LayoutProps) => {
  return (
    <div>
      <nav className="flex justify-between py-4 px-32 text-white font-semibold">
        <a href="/" className="flex gap-2 hover:text-blue-200 transition">
          <Image
            src="/media/logos/transparent.png"
            width={320}
            height={320}
            alt="logo"
            className="w-8"
          />
          <div className="text-2xl">Tuturuuu</div>
        </a>

        <div className="flex flex-row gap-4">
          <a href="/features" className="hover:text-blue-200 transition h-fit">
            Features
          </a>
          <a href="/pricing" className="hover:text-blue-200 transition h-fit">
            Pricing
          </a>
        </div>

        <a href="/login" className="hover:text-blue-200 transition h-fit">
          Login
        </a>
      </nav>
      <div>{children}</div>
    </div>
  );
};

export default Layout;
