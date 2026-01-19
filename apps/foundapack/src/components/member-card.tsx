'use client';

import { useMagnetic } from '@/hooks/use-magnetic';
import { Member } from '@/lib/constants';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useRef } from 'react';

interface MemberCardProps {
  member: Member;
}

export function MemberCard({ member }: MemberCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { x, y } = useMagnetic(cardRef, {
    strength: 0.2,
    radius: 150,
  });

  return (
    <motion.div
      ref={cardRef}
      animate={{ x, y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15, mass: 0.1 }}
      className="group relative h-full w-full"
    >
      <div
        className={cn(
          'relative h-full w-full overflow-hidden rounded-2xl border border-pack-border/30 bg-pack-charcoal/50 p-6 transition-all duration-500',
          'hover:border-pack-amber/50 hover:bg-pack-surface/80',
          'pack-card-glow'
        )}
      >
        {/* Campfire Glow Hover Effect */}
        <div
          className={cn(
            'absolute inset-0 pointer-events-none transition-opacity duration-700 opacity-0',
            'group-hover:opacity-100'
          )}
          style={{
            background:
              'radial-gradient(circle at 50% 100%, rgba(251, 191, 36, 0.15) 0%, transparent 70%)',
          }}
        />

        {/* Member Avatar / Silhouette */}
        <div className="relative mb-6 aspect-square w-full overflow-hidden rounded-xl bg-pack-void">
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt={member.name}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-pack-void/50 relative">
              {/* Spectral Silhouette Placeholder */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="h-3/4 w-3/4 text-pack-amber/20"
              >
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  fill="currentColor"
                  fillOpacity="0.05"
                />
              </svg>

              <div className="absolute inset-0 bg-gradient-to-t from-pack-amber/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>
          )}
          
          <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
        </div>

        {/* Member Info */}
        <div className="relative z-10">
          <h4 className="mb-1 font-bold text-lg text-pack-white pack-font-serif tracking-wide group-hover:text-pack-amber transition-colors">
            {member.name}
          </h4>
          <p className="mb-3 text-sm text-pack-amber font-medium">
            {member.role}
          </p>
          <div className="flex items-center gap-2">
            <span className="h-px w-4 bg-pack-border" />
            <span className="text-[10px] uppercase tracking-widest text-pack-frost/40 group-hover:text-pack-frost/70 transition-colors">
              {member.venture}
            </span>
          </div>
        </div>

        {/* Texture Overlay */}
        <div className="pack-texture-overlay opacity-5 group-hover:opacity-10 transition-opacity" />
      </div>
    </motion.div>
  );
}
