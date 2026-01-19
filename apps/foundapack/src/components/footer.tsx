'use client';

import { motion } from 'framer-motion';

export function Footer() {
  return (
    <footer className="relative w-full border-t border-pack-border/20 bg-pack-void pt-24 pb-12 px-4 overflow-hidden">
      {/* Visual Anchor: The Final Campfire */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="relative">
          <div className="h-32 w-32 rounded-full bg-pack-amber/10 blur-3xl animate-pulse" />
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

      <div className="mx-auto max-w-7xl relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-8 mb-24">
          
          {/* Brand & Mission */}
          <div className="space-y-6">
            <h4 className="font-bold text-3xl text-pack-white pack-font-serif tracking-tight">
              Foundapack
            </h4>
            <p className="text-pack-frost/50 text-lg leading-relaxed max-w-sm">
              The operating system for the next generation of visionary founders. 
              Built in the shadows, united by the fire.
            </p>
            <div className="flex gap-4">
              <a href="#" className="h-10 w-10 rounded-full border border-pack-border/30 flex items-center justify-center text-pack-frost/40 hover:border-pack-amber hover:text-pack-amber transition-all">
                𝕏
              </a>
              <a href="#" className="h-10 w-10 rounded-full border border-pack-border/30 flex items-center justify-center text-pack-frost/40 hover:border-pack-amber hover:text-pack-amber transition-all">
                GH
              </a>
            </div>
          </div>

          {/* Lore-based Navigation */}
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <h5 className="font-mono text-[10px] uppercase tracking-[0.3em] text-pack-amber/60">
                The Journey
              </h5>
              <ul className="space-y-3">
                <li>
                  <a href="#" className="text-pack-frost/40 hover:text-pack-white transition-colors">The Tundra</a>
                </li>
                <li>
                  <a href="#" className="text-pack-frost/40 hover:text-pack-white transition-colors">The Council</a>
                </li>
                <li>
                  <a href="#" className="text-pack-frost/40 hover:text-pack-white transition-colors">Pack Emblems</a>
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h5 className="font-mono text-[10px] uppercase tracking-[0.3em] text-pack-amber/60">
                Join the Hunt
              </h5>
              <ul className="space-y-3">
                <li>
                  <a href="#" className="text-pack-frost/40 hover:text-pack-white transition-colors">The Den</a>
                </li>
                <li>
                  <a href="#" className="text-pack-frost/40 hover:text-pack-white transition-colors">Lore</a>
                </li>
                <li>
                  <a href="#" className="text-pack-frost/40 hover:text-pack-white transition-colors">Support</a>
                </li>
              </ul>
            </div>
          </div>

          {/* Backer Recognition (Tuturuuu) */}
          <div className="space-y-6 md:text-right flex flex-col md:items-end">
            <h5 className="font-mono text-[10px] uppercase tracking-[0.3em] text-pack-amber/60">
              Forged By
            </h5>
            <div className="space-y-2">
              <span className="block text-4xl font-bold text-pack-white tracking-tighter">
                Tuturuuu
              </span>
              <p className="pack-font-handwritten text-2xl text-pack-amber/80 rotate-[-2deg]">
                The Alpha behind the Pack.
              </p>
            </div>
            <p className="text-pack-frost/30 text-sm max-w-xs md:text-right leading-relaxed italic">
              "We don't just build products; we build the force that moves the world forward."
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-12 border-t border-pack-border/10 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-pack-frost/20 text-[10px] uppercase tracking-widest font-mono">
            &copy; 2026 Foundapack &bull; All Rights Reserved
          </p>
          <div className="flex gap-8 text-pack-frost/20 text-[10px] uppercase tracking-widest font-mono">
            <a href="#" className="hover:text-pack-amber transition-colors">Privacy Lore</a>
            <a href="#" className="hover:text-pack-amber transition-colors">Terms of the Pack</a>
          </div>
        </div>
      </div>

      {/* Decorative texture overlay */}
      <div className="pack-texture-overlay opacity-10" />
    </footer>
  );
}