import { Project } from './data';
import { motion } from 'framer-motion';
import { Github, Globe, Monitor, Play, Users, Wrench } from 'lucide-react';

interface ProjectCardProps {
  project: Project;
  type?: string;
  status?: string;
  isCenter?: boolean;
  onClick: () => void;
}

// Enhanced status color mapping with gradients
const STATUS_COLORS = {
  completed: 'from-green-500 to-emerald-600',
  ongoing: 'from-blue-500 to-cyan-600',
  planning: 'from-yellow-500 to-orange-500',
} as const;

// Enhanced type configurations with icons and colors
const TYPE_CONFIG = {
  web: {
    label: 'Web Development',
    icon: Globe,
    gradient: 'from-purple-500 to-pink-500',
    bgGradient: 'from-purple-500/10 to-pink-500/10',
  },
  software: {
    label: 'Software',
    icon: Monitor,
    gradient: 'from-blue-500 to-cyan-500',
    bgGradient: 'from-blue-500/10 to-cyan-500/10',
  },
  hardware: {
    label: 'Hardware',
    icon: Wrench,
    gradient: 'from-orange-500 to-red-500',
    bgGradient: 'from-orange-500/10 to-red-500/10',
  },
} as const;

export default function ProjectCard({
  project,
  type,
  status,
  isCenter = false,
  onClick,
}: ProjectCardProps) {
  // Determine if this card should be highlighted based on current filters
  const getHighlightStatus = () => {
    if (type && status) {
      return type === project.type && status === project.status;
    } else if (type) {
      return type === project.type;
    } else if (status) {
      return status === project.status;
    }
    return null;
  };

  const isHighlighted = getHighlightStatus();
  const typeConfig = TYPE_CONFIG[project.type];
  const TypeIcon = typeConfig.icon;

  // Enhanced card container styles with modern glassmorphism
  const getCardContainerStyles = () => {
    const baseStyles = `
      relative h-full min-h-[480px] rounded-3xl p-6 pb-24 text-left transition-all duration-500
      border backdrop-blur-md overflow-hidden group flex flex-col
    `;

    const centerStyles = isCenter
      ? 'shadow-2xl shadow-[#1AF4E6]/20 border-[#1AF4E6]/30'
      : 'border-white/10';

    const highlightStyles = isHighlighted
      ? `bg-gradient-to-br ${typeConfig.bgGradient} border-[#1AF4E6]/50 shadow-xl shadow-[#1AF4E6]/25`
      : isCenter
        ? 'bg-white/[0.08] hover:bg-white/[0.12] border-white/20'
        : 'bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20 hover:shadow-lg';

    return `${baseStyles} ${centerStyles} ${highlightStyles}`;
  };

  // Enhanced floating status indicator
  const renderStatusIndicator = () => (
    <div className="absolute top-4 left-4">
      <div
        className={`rounded-full bg-gradient-to-r px-3 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-sm ${STATUS_COLORS[project.status]} `}
      >
        {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
      </div>
    </div>
  );

  // Enhanced floating type indicator
  const renderTypeIndicator = () => (
    <div className="absolute top-4 right-4">
      <div
        className={`flex items-center gap-2 rounded-full bg-gradient-to-r px-3 py-1 text-xs font-medium text-white ${typeConfig.gradient}`}
      >
        <TypeIcon className="h-3 w-3" />
        <span>{typeConfig.label}</span>
      </div>
    </div>
  );

  // Render the card header with enhanced typography
  const renderHeader = () => (
    <div className="mt-8 mb-6">
      <div className="mb-3 flex items-start gap-3">
        <div
          className={`rounded-xl bg-gradient-to-r p-2 ${typeConfig.gradient}`}
        >
          <TypeIcon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h3
            className={`leading-tight font-bold text-white ${isCenter ? 'text-2xl' : 'text-xl'}`}
          >
            {project.name}
          </h3>
        </div>
      </div>

      {project.manager && (
        <div className="flex items-center gap-2 text-white/60">
          <Users className="h-4 w-4" />
          <p className={`${isCenter ? 'text-sm' : 'text-xs'}`}>
            Led by {project.manager}
          </p>
        </div>
      )}
    </div>
  );

  // Enhanced description with better truncation
  const renderDescription = () => (
    <div className="mb-6">
      <p
        className={`leading-relaxed text-white/80 ${
          isCenter ? 'text-base' : 'line-clamp-3 text-sm'
        }`}
      >
        {project.description || 'No description available.'}
      </p>
    </div>
  );

  // Enhanced technology stack with better visual design
  const renderTechStack = () => {
    if (!project.techStack || project.techStack.length === 0) {
      return null;
    }

    return (
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-0.5 w-4 bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6]" />
          <span className="text-xs font-medium tracking-wider text-white/50 uppercase">
            Tech Stack
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Show first 3 technologies with enhanced styling */}
          {project.techStack.slice(0, 3).map((tech, index) => (
            <motion.span
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`rounded-lg border border-white/20 bg-gradient-to-r from-white/10 to-white/5 px-3 py-1 font-medium text-white/90 backdrop-blur-sm ${isCenter ? 'text-sm' : 'text-xs'} `}
            >
              {tech}
            </motion.span>
          ))}

          {/* Show count of remaining technologies */}
          {project.techStack.length > 3 && (
            <span
              className={`rounded-lg border border-white/10 bg-white/5 px-3 py-1 font-medium text-white/50 ${isCenter ? 'text-sm' : 'text-xs'} `}
            >
              +{project.techStack.length - 3}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Enhanced footer with action buttons
  const renderFooter = () => (
    <div className="absolute right-6 bottom-6 left-6">
      {/* Subtle divider */}
      <div className="mb-4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="flex items-center justify-between">
        {/* Quick action buttons */}
        <div className="flex gap-2">
          {project.githubUrl && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="rounded-lg bg-white/10 p-2 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                window.open(project.githubUrl, '_blank');
              }}
            >
              <Github className="h-4 w-4" />
            </motion.button>
          )}
          {project.demoUrl && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="rounded-lg bg-white/10 p-2 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                window.open(project.demoUrl, '_blank');
              }}
            >
              <Play className="h-4 w-4" />
            </motion.button>
          )}
        </div>

        {/* Team Size Indicator with enhanced design */}
        {project.members && project.members.length > 0 && (
          <div
            className={`flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1 text-white/70 backdrop-blur-sm ${isCenter ? 'text-sm' : 'text-xs'}`}
          >
            <Users className="h-4 w-4" />
            <span>
              {project.members.length} member
              {project.members.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  // Enhanced visual effects with animated gradients
  const renderEffects = () => (
    <>
      {/* Animated background gradient */}
      <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div
          className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${typeConfig.bgGradient}`}
        />
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#F4B71A]/5 to-[#1AF4E6]/5" />
      </div>

      {/* Shimmer effect on hover */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full rounded-3xl bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-all duration-1000 group-hover:translate-x-full group-hover:opacity-100" />

      {/* Border glow effect for center cards */}
      {isCenter && (
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-[#F4B71A]/20 to-[#1AF4E6]/20 opacity-50 blur-xl" />
      )}
    </>
  );

  return (
    <motion.button
      onClick={onClick}
      whileHover={{
        y: -8,
        scale: isCenter ? 1.03 : 1.02,
        rotateY: 2,
      }}
      whileTap={{ scale: 0.98 }}
      transition={{
        duration: 0.3,
        type: 'spring',
        stiffness: 400,
        damping: 25,
      }}
      className="group perspective-1000 relative h-full w-full"
    >
      <div className={getCardContainerStyles()}>
        {/* Status Indicator */}
        {renderStatusIndicator()}

        {/* Type Indicator */}
        {renderTypeIndicator()}

        {/* Card Content - Flex grow to push footer down */}
        <div className="flex flex-grow flex-col">
          {renderHeader()}
          {renderDescription()}
          {renderTechStack()}
        </div>

        {/* Footer - Fixed at bottom */}
        {renderFooter()}

        {/* Visual Effects */}
        {renderEffects()}
      </div>
    </motion.button>
  );
}
