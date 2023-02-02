import Image from "next/image";
import Link from "next/link";

const Navbar = () => {
  return (
    <nav className="fixed z-10 top-0 inset-x-0 backdrop-blur-lg bg-zinc-800/50 flex items-center justify-between p-4 md:px-32 lg:px-64 text-white font-semibold border-b border-zinc-700">
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

      {/* <div className="flex items-center gap-4">
    <a href="/features" className="hover:text-blue-200 transition">
      Features
    </a>
    <a href="/pricing" className="hover:text-blue-200 transition">
      Pricing
    </a>
  </div> */}

      <div className="flex items-center gap-4">
        <Link
          href="https://app.tuturuuu.com/login"
          className="bg-blue-300/20 hover:bg-blue-300/30 text-blue-300 hover:text-blue-200 rounded-full px-8 py-1 transition duration-300"
        >
          Login
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
