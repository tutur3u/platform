import { Project } from './data';
import { motion } from 'framer-motion';

interface ProjectCardProps {
  project: Project;
  type?: string;
  status?: string;
  isCenter?: boolean;
  onClick: () => void;
}

// Status color mapping for visual indicators
const STATUS_COLORS = {
  completed: 'bg-green-500',
  ongoing: 'bg-blue-500',
  planning: 'bg-yellow-500',
} as const;

// Type label mapping for display
const TYPE_LABELS = {
  web: 'Web Dev',
  software: 'Software',
  hardware: 'Hardware',
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

  // Get card container styles based on state
  const getCardContainerStyles = () => {
    const baseStyles = `
      relative h-full min-h-[400px] rounded-2xl p-6 text-left transition-all duration-300
      border-2 backdrop-blur-sm
    `;

    const centerStyles = isCenter
      ? 'shadow-2xl shadow-[#1AF4E6]/30 border-[#1AF4E6]/40'
      : 'border-white/10';

    const highlightStyles = isHighlighted
      ? 'bg-gradient-to-br from-[#F4B71A]/10 to-[#1AF4E6]/10 border-[#1AF4E6]/50 shadow-xl shadow-[#1AF4E6]/20'
      : isCenter
        ? 'bg-white/10 hover:bg-white/15'
        : 'bg-white/5 hover:bg-white/10 hover:border-white/20 hover:shadow-lg';

    return `${baseStyles} ${centerStyles} ${highlightStyles}`;
  };

  // Get type badge styles
  const getTypeBadgeStyles = () => {
    if (isHighlighted) {
      return 'bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] text-black';
    } else if (isCenter) {
      return 'bg-gradient-to-r from-[#F4B71A]/30 to-[#1AF4E6]/30 text-white border border-white/20';
    } else {
      return 'bg-gradient-to-r from-[#F4B71A]/20 to-[#1AF4E6]/20 text-white border border-white/10';
    }
  };

  // Render the card header with title and status
  const renderHeader = () => (
    <div className="mb-6 flex items-start justify-between">
      <div className="flex-1">
        <h3
          className={`mb-3 leading-tight font-bold ${isCenter ? 'text-2xl' : 'text-xl'} text-white`}
        >
          {project.name}
        </h3>
        {project.manager && (
          <p className={`text-white/70 ${isCenter ? 'text-base' : 'text-sm'}`}>
            Led by {project.manager}
          </p>
        )}
      </div>

      {/* Status Indicator Dot */}
      <div
        className={`rounded-full ${STATUS_COLORS[project.status]} ${isCenter ? 'h-4 w-4' : 'h-3 w-3'}`}
      />
    </div>
  );

  // Render project description
  const renderDescription = () => (
    <div className="mb-8">
      <p
        className={`leading-relaxed text-white/80 ${isCenter ? 'text-base' : 'line-clamp-2 text-sm'}`}
      >
        {project.description || 'No description available.'}
      </p>
    </div>
  );

  // Render technology stack preview
  const renderTechStack = () => {
    if (!project.techStack || project.techStack.length === 0) {
      return null;
    }

    return (
      <div className="mb-8 flex flex-wrap gap-2">
        {/* Show first 2 technologies */}
        {project.techStack.slice(0, 2).map((tech, index) => (
          <span
            key={index}
            className={`rounded-lg border border-white/10 bg-white/10 px-3 py-1 font-medium text-white/90 ${isCenter ? 'text-sm' : 'text-xs'}`}
          >
            {tech}
          </span>
        ))}

        {/* Show count of remaining technologies */}
        {project.techStack.length > 2 && (
          <span
            className={`rounded-lg border border-white/10 bg-white/10 px-3 py-1 font-medium text-white/60 ${isCenter ? 'text-sm' : 'text-xs'}`}
          >
            +{project.techStack.length - 2}
          </span>
        )}
      </div>
    );
  };

  // Render card footer with type badge and team info
  const renderFooter = () => (
    <div className="absolute right-6 bottom-6 left-6">
      <div className="flex items-center justify-between">
        {/* Project Type Badge */}
        <div
          className={`rounded-xl px-4 py-2 text-sm font-medium ${getTypeBadgeStyles()}`}
        >
          {TYPE_LABELS[project.type]}
        </div>

        {/* Team Size Indicator */}
        {project.members && project.members.length > 0 && (
          <div
            className={`flex items-center space-x-2 text-white/70 ${isCenter ? 'text-base' : 'text-sm'}`}
          >
            <span>👥</span>
            <span>
              {project.members.length} member
              {project.members.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  // Render visual effects
  const renderEffects = () => (
    <>
      {/* Center card highlight effect */}
      {isCenter && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-[#F4B71A]/10 to-[#1AF4E6]/10 opacity-100 transition-opacity duration-300" />
      )}

      {/* Subtle glow effect on hover */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-[#F4B71A]/5 to-[#1AF4E6]/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </>
  );

  return (
    <motion.button
      onClick={onClick}
      whileHover={{
        y: -4,
        scale: isCenter ? 1.02 : 0.95,
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="group relative h-full w-full"
    >
      <div className={getCardContainerStyles()}>
        {/* Card Content */}
        {renderHeader()}
        {renderDescription()}
        {renderTechStack()}
        {renderFooter()}

        {/* Visual Effects */}
        {renderEffects()}
      </div>
    </motion.button>
  );
}
