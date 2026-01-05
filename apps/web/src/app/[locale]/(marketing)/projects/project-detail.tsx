import { GLBViewerCanvas } from './3d-model';
import { Project } from './data';
import {
  Calendar,
  Code,
  Component,
  ExternalLink,
  Github,
  Play,
  X,
} from '@ncthub/ui/icons';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useState } from 'react';

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
  const [is3DViewOpen, setIs3DViewOpen] = useState(false);

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
    semester,
    githubUrl,
    demoUrl,
    image,
    modelFile,
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
        className="border-border bg-background/95 relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border shadow-2xl backdrop-blur-lg"
        variants={MODAL_VARIANTS}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={handleModalClick}
      >
        {/* Header */}
        <div className="relative p-8">
          <button
            onClick={onClose}
            className="bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground absolute right-6 top-6 z-10 rounded-full p-2 transition-all duration-200"
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

            <div className="absolute left-4 top-4 flex gap-2">
              <div
                className={`text-primary-foreground rounded-full px-3 py-1 text-sm font-medium ${STATUS_CONFIG[status].color}`}
              >
                {STATUS_CONFIG[status].label}
              </div>
              <div className="border-border bg-muted text-foreground rounded-full border px-3 py-1 text-sm font-medium">
                {TYPE_LABELS[type]}
              </div>
              <div className="border-border bg-muted text-foreground rounded-full border px-3 py-1 text-sm font-medium">
                {semester}
              </div>
            </div>
          </div>

          <div className="text-center">
            <h1 className="mb-2 bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text py-2 text-4xl font-bold leading-tight text-transparent md:text-5xl md:leading-tight">
              {name}
            </h1>
            {manager && (
              <p className="text-muted-foreground text-xl">
                Project Lead:{' '}
                <span className="text-foreground font-semibold">{manager}</span>
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
                    className="border-border bg-muted/80 text-foreground hover:border-border hover:bg-muted flex items-center gap-2 rounded-xl border px-6 py-3 backdrop-blur-sm transition-all duration-200"
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
                    className="bg-foreground text-background hover:bg-foreground/90 flex items-center gap-2 rounded-xl px-6 py-3 font-medium transition-all duration-200"
                  >
                    <Play size={20} />
                    <span>View Demo</span>
                  </motion.a>
                )}
                {modelFile && (
                  <motion.button
                    onClick={() => {
                      setIs3DViewOpen((prev) => !prev);
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#24a4db] to-[#1AF4E6] px-6 py-3 font-medium text-black transition-all duration-200 hover:shadow-lg hover:shadow-[#24a4db]/30"
                  >
                    <Component size={20} />
                    <span>{is3DViewOpen ? 'Close Model' : 'View Model'}</span>
                  </motion.button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8 px-8 pb-8">
          {/* 3D Model Viewer */}
          <AnimatePresence initial={false} mode="popLayout">
            {is3DViewOpen && modelFile && (
              <motion.div
                key="viewer"
                layout
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { type: 'spring', stiffness: 260, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                style={{ overflow: 'hidden' }}
                className="rounded-2xl"
              >
                <GLBViewerCanvas
                  modelUrl={modelFile}
                  enableControls
                  autoRotate
                  scale={0.5}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Project Stats */}
          <div className="mb-8 grid grid-cols-4 gap-4">
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
              {
                label: 'Semester',
                value: semester,
                icon: Calendar,
              },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border-border bg-muted/50 rounded-xl border p-4 text-center"
              >
                <div className="mb-2 flex justify-center">
                  <stat.icon className="h-6 w-6 text-[#1AF4E6]" />
                </div>
                <p className="text-foreground text-2xl font-bold">
                  {stat.value}
                </p>
                <p className="text-muted-foreground text-sm">{stat.label}</p>
              </motion.div>
            ))}
          </div>
          {/* Description */}
          {description && (
            <div className="border-border bg-muted/50 rounded-2xl border p-6">
              <h2 className="text-foreground mb-4 text-2xl font-semibold">
                About
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                {description}
              </p>
            </div>
          )}
          {/* Purpose */}
          {purpose && (
            <div className="border-border bg-muted/50 rounded-2xl border p-6">
              <h2 className="text-foreground mb-4 text-2xl font-semibold">
                Purpose
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                {purpose}
              </p>
            </div>
          )}
          {/* Tech Stack */}
          {techStack && techStack.length > 0 && (
            <div className="border-border bg-muted/50 rounded-2xl border p-6">
              <h2 className="text-foreground mb-6 text-2xl font-semibold">
                Technologies
              </h2>
              <div className="flex flex-wrap gap-3">
                {techStack.map((tech, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="border-border bg-muted rounded-xl border px-4 py-2 backdrop-blur-sm"
                  >
                    <span className="text-foreground font-medium">{tech}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          {/* Team Members */}
          {members && members.length > 0 && (
            <div className="border-border bg-muted/50 rounded-2xl border p-6">
              <h2 className="text-foreground mb-6 text-2xl font-semibold">
                Team Members
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {members.map((person, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="border-border bg-muted/50 hover:bg-muted group flex items-center justify-between rounded-xl border p-4 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-foreground text-background flex h-10 w-10 items-center justify-center rounded-full font-bold">
                        {person.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-foreground group-hover:text-foreground font-semibold transition-colors">
                          {person.name}
                        </p>
                        <p className="text-muted-foreground text-sm">
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
              className="bg-foreground text-background hover:bg-foreground/90 rounded-2xl px-8 py-3 font-semibold transition-all duration-200"
            >
              Close
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
