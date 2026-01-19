'use client';

import { motion } from 'framer-motion';

export function Footer() {
  return (
    <footer className="relative w-full overflow-hidden border-pack-border/20 border-t bg-pack-void px-4 pt-24 pb-12">
      {/* Visual Anchor: The Final Campfire */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          <div className="h-32 w-32 animate-pulse rounded-full bg-pack-amber/10 blur-3xl" />
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute inset-0 h-full w-full bg-[radial-gradient(circle_at_center,_var(--color-pack-amber)_0%,_transparent_70%)] opacity-20"
          />
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-24 grid grid-cols-1 gap-16 md:grid-cols-3 md:gap-8">
          {/* Brand & Mission */}
          <div className="space-y-6">
            <h4 className="pack-font-serif font-bold text-3xl text-pack-white tracking-tight">
              Foundapack
            </h4>
            <p className="max-w-sm text-lg text-pack-frost/50 leading-relaxed">
              The operating system for the next generation of visionary
              founders. Built in the shadows, united by the fire.
            </p>
            <div className="flex gap-4">
              <a
                href="/"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-pack-border/30 text-pack-frost/40 transition-all hover:border-pack-amber hover:text-pack-amber"
              >
                𝕏
              </a>
              <a
                href="/"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-pack-border/30 text-pack-frost/40 transition-all hover:border-pack-amber hover:text-pack-amber"
              >
                GH
              </a>
            </div>
          </div>

          {/* Lore-based Navigation */}
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <h5 className="font-mono text-[10px] text-pack-amber/60 uppercase tracking-[0.3em]">
                The Journey
              </h5>
              <ul className="space-y-3">
                <li>
                  <a
                    href="/"
                    className="text-pack-frost/40 transition-colors hover:text-pack-white"
                  >
                    The Tundra
                  </a>
                </li>
                <li>
                  <a
                    href="/"
                    className="text-pack-frost/40 transition-colors hover:text-pack-white"
                  >
                    The Council
                  </a>
                </li>
                <li>
                  <a
                    href="/"
                    className="text-pack-frost/40 transition-colors hover:text-pack-white"
                  >
                    Pack Emblems
                  </a>
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h5 className="font-mono text-[10px] text-pack-amber/60 uppercase tracking-[0.3em]">
                Join the Hunt
              </h5>
              <ul className="space-y-3">
                <li>
                  <a
                    href="/"
                    className="text-pack-frost/40 transition-colors hover:text-pack-white"
                  >
                    The Den
                  </a>
                </li>
                <li>
                  <a
                    href="/"
                    className="text-pack-frost/40 transition-colors hover:text-pack-white"
                  >
                    Lore
                  </a>
                </li>
                <li>
                  <a
                    href="/"
                    className="text-pack-frost/40 transition-colors hover:text-pack-white"
                  >
                    Support
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Backer Recognition (Tuturuuu) */}
          <div className="flex flex-col space-y-6 md:items-end md:text-right">
            <h5 className="font-mono text-[10px] text-pack-amber/60 uppercase tracking-[0.3em]">
              Forged By
            </h5>
            <div className="space-y-2">
              <span className="block font-bold text-4xl text-pack-white tracking-tighter">
                Tuturuuu
              </span>
              <p className="pack-font-handwritten rotate-[-2deg] text-2xl text-pack-amber/80">
                The Alpha behind the Pack.
              </p>
            </div>
            <p className="max-w-xs text-pack-frost/30 text-sm italic leading-relaxed md:text-right">
              "We don't just build products; we build the force that moves the
              world forward."
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col items-center justify-between gap-6 border-pack-border/10 border-t pt-12 md:flex-row">
          <p className="font-mono text-[10px] text-pack-frost/20 uppercase tracking-widest">
            &copy; 2026 Foundapack &bull; All Rights Reserved
          </p>
          <div className="flex gap-8 font-mono text-[10px] text-pack-frost/20 uppercase tracking-widest">
            <a href="/" className="transition-colors hover:text-pack-amber">
              Privacy Lore
            </a>
            <a href="/" className="transition-colors hover:text-pack-amber">
              Terms of the Pack
            </a>
          </div>
        </div>
      </div>

      {/* Decorative texture overlay */}
      <div className="pack-texture-overlay opacity-10" />
    </footer>
  );
}
