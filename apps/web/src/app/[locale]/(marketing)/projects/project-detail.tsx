import { Project } from './data';
import { motion } from 'framer-motion';
import { Code, ExternalLink, Github, Play, X } from 'lucide-react';
import Image from 'next/image';

interface ProjectDetailProps {
  onClose: () => void;
  data: Project | undefined;
}

const STATUS_CONFIG = {
  completed: {
    color: 'bg-green-500',
    label: 'Completed',
  },
  ongoing: {
    color: 'bg-blue-500',
    label: 'In Progress',
  },
  planning: {
    color: 'bg-yellow-500',
    label: 'Planning',
  },
} as const;

const TYPE_LABELS = {
  web: 'Web Development',
  software: 'Software',
  hardware: 'Hardware',
} as const;

const MODAL_VARIANTS = {
  hidden: { scale: 0.9, opacity: 0, y: 20 },
  visible: { scale: 1, opacity: 1, y: 0 },
  exit: { scale: 0.9, opacity: 0, y: 20 },
};

const BACKDROP_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export default function ProjectDetail({ onClose, data }: ProjectDetailProps) {
  if (!data) {
    return null;
  }

  const {
    name,
    description,
    techStack,
    members,
    purpose,
    manager,
    type,
    status,
    githubUrl,
    demoUrl,
    image,
  } = data;

  const handleBackdropClick = () => {
    onClose();
  };

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={BACKDROP_VARIANTS}
      onClick={handleBackdropClick}
    >
      <motion.div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 to-slate-800/95 shadow-2xl backdrop-blur-lg"
        variants={MODAL_VARIANTS}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={handleModalClick}
      >
        {/* Header */}
        <div className="relative p-8">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 z-10 rounded-full bg-white/10 p-2 text-white/70 transition-all duration-200 hover:bg-white/20 hover:text-white"
          >
            <X size={20} />
          </button>

          <div className="relative mb-8 h-48 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#F4B71A]/20 to-[#1AF4E6]/20">
            <Image
              src={image || '/media/background/demo.jpg'}
              fill
              alt={`${name} project demo`}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

            <div className="absolute top-4 left-4 flex gap-2">
              <div
                className={`rounded-full px-3 py-1 text-sm font-medium text-white ${STATUS_CONFIG[status].color}`}
              >
                {STATUS_CONFIG[status].label}
              </div>
              <div className="rounded-full bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] px-3 py-1 text-sm font-medium text-black">
                {TYPE_LABELS[type]}
              </div>
            </div>
          </div>

          <div className="text-center">
            <h1 className="mb-4 bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
              {name}
            </h1>
            {manager && (
              <p className="text-xl text-white/80">
                Project Lead:{' '}
                <span className="font-semibold text-white">{manager}</span>
              </p>
            )}

            {/* Project Links */}
            {(githubUrl || demoUrl) && (
              <div className="mt-6 flex justify-center gap-4">
                {githubUrl && (
                  <motion.a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 rounded-xl border border-gray-600/50 bg-gray-800/80 px-6 py-3 text-white backdrop-blur-sm transition-all duration-200 hover:border-gray-500/50 hover:bg-gray-700/80"
                  >
                    <Github size={20} />
                    <span className="font-medium">View Code</span>
                  </motion.a>
                )}
                {demoUrl && (
                  <motion.a
                    href={demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] px-6 py-3 font-medium text-black transition-all duration-200 hover:shadow-lg hover:shadow-[#F4B71A]/30"
                  >
                    <Play size={20} />
                    <span>View Demo</span>
                  </motion.a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8 px-8 pb-8">
          {/* Project Stats */}
          <div className="mb-8 grid grid-cols-3 gap-4">
            {[
              {
                label: 'Technologies',
                value: techStack?.length || 0,
                icon: Code,
              },
              {
                label: 'Team Size',
                value: (members?.length || 0) + (manager ? 1 : 0),
                icon: ExternalLink,
              },
              {
                label: 'Status',
                value: STATUS_CONFIG[status].label,
                icon: Play,
              },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="rounded-xl border border-white/10 bg-white/5 p-4 text-center"
              >
                <div className="mb-2 flex justify-center">
                  <stat.icon className="h-6 w-6 text-[#1AF4E6]" />
                </div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-white/70">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Description */}
          {description && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">About</h2>
              <p className="text-lg leading-relaxed text-white/80">
                {description}
              </p>
            </div>
          )}

          {/* Purpose */}
          {purpose && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">
                Purpose
              </h2>
              <p className="text-lg leading-relaxed text-white/80">{purpose}</p>
            </div>
          )}

          {/* Tech Stack */}
          {techStack && techStack.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="mb-6 text-2xl font-semibold text-white">
                Technologies
              </h2>
              <div className="flex flex-wrap gap-3">
                {techStack.map((tech, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="rounded-xl border border-white/20 bg-gradient-to-r from-[#F4B71A]/20 to-[#1AF4E6]/20 px-4 py-2 backdrop-blur-sm"
                  >
                    <span className="font-medium text-white">{tech}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Team Members */}
          {members && members.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="mb-6 text-2xl font-semibold text-white">
                Team Members
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {members.map((person, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/10 p-4 transition-colors hover:bg-white/15"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] font-bold text-black">
                        {person.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-semibold text-white transition-colors group-hover:text-[#1AF4E6]">
                          {person.name}
                        </p>
                        <p className="text-sm text-[#1AF4E6]">
                          {person.role || 'Team Member'}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rounded-b-3xl border-t border-white/10 bg-white/5 px-8 py-6">
          <div className="flex justify-center gap-4">
            {githubUrl && (
              <motion.a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 rounded-xl border border-gray-600/50 bg-gray-800/80 px-6 py-3 text-white backdrop-blur-sm transition-all duration-200 hover:border-gray-500/50 hover:bg-gray-700/80"
              >
                <Github size={20} />
                <span className="font-medium">View on GitHub</span>
              </motion.a>
            )}
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-2xl bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] px-8 py-3 font-semibold text-black transition-all duration-200 hover:shadow-lg hover:shadow-[#F4B71A]/30"
            >
              Close
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
