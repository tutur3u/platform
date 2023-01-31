import Image from "next/image";
import { FC } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }: LayoutProps) => {
  return (
    <div>
      <nav className="flex items-center justify-between py-4 px-16 text-white font-semibold border-b border-zinc-700">
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

        <div className="flex items-center gap-4">
          <a href="/features" className="hover:text-blue-200 transition">
            Features
          </a>
          <a href="/pricing" className="hover:text-blue-200 transition">
            Pricing
          </a>
        </div>

        <div className="flex items-center gap-4">
          <a href="/login" className="hover:text-blue-200 transition">
            Login
          </a>
          <a
            href="/pricing"
            className="bg-gradient-to-r from-rose-400/70 via-fuchsia-500/70 to-indigo-500/70 rounded-lg px-4 py-1 hover:from-rose-400 hover:via-fuchsia-500 hover:to-indigo-500"
          >
            Start journey
          </a>
        </div>
      </nav>
      <div>{children}</div>
    </div>
  );
};

export default Layout;
