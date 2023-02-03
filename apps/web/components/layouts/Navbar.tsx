import Image from 'next/image';
import Link from 'next/link';

const Navbar = () => {
  return (
    <nav className="fixed inset-x-0 top-0 z-10 flex items-center justify-between border-b border-zinc-700 bg-zinc-800/50 p-4 font-semibold text-white backdrop-blur-lg md:px-32 lg:px-64">
      <a href="/" className="flex gap-2 transition hover:text-blue-200">
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
          className="rounded-full bg-blue-300/20 px-8 py-1 text-blue-300 transition duration-300 hover:bg-blue-300/30 hover:text-blue-200"
        >
          Login
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
