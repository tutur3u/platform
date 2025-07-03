import { Project } from './data';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { X } from 'lucide-react';

interface ProjectDetailProps {
  onClose: () => void;
  data: Project | undefined;
}

const STATUS_CONFIG = {
  completed: {
    color: 'bg-green-500',
    label: 'Completed'
  },
  ongoing: {
    color: 'bg-blue-500',
    label: 'In Progress'
  },
  planning: {
    color: 'bg-yellow-500',
    label: 'Planning'
  }
} as const;

const TYPE_LABELS = {
  web: 'Web Development',
  software: 'Software',
  hardware: 'Hardware',
} as const;

const MODAL_VARIANTS = {
  hidden: { scale: 0.9, opacity: 0, y: 20 },
  visible: { scale: 1, opacity: 1, y: 0 },
  exit: { scale: 0.9, opacity: 0, y: 20 }
};

const BACKDROP_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

export default function ProjectDetail({ onClose, data }: ProjectDetailProps) {
  if (!data) {
    return null;
  }

  const { name, description, techStack, members, purpose, manager, type, status } = data;

  const handleBackdropClick = () => {
    onClose();
  };

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const renderHeader = () => (
    <div className="relative p-8">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-10 rounded-full p-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all duration-200"
      >
        <X size={20} />
      </button>

      <div className="relative w-full h-48 rounded-2xl overflow-hidden mb-8 bg-gradient-to-br from-[#F4B71A]/20 to-[#1AF4E6]/20">
        <Image
          src="/media/background/demo.jpg"
          fill
          alt={`${name} project demo`}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        <div className="absolute top-4 left-4 flex gap-2">
          <div className={`px-3 py-1 rounded-full text-sm font-medium text-white ${STATUS_CONFIG[status].color}`}>
            {STATUS_CONFIG[status].label}
          </div>
          <div className="px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] text-black">
            {TYPE_LABELS[type]}
          </div>
        </div>
      </div>

      <div className="text-center">
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text text-transparent mb-4">
          {name}
        </h1>
        {manager && (
          <p className="text-xl text-white/80">
            Project Lead: <span className="font-semibold text-white">{manager}</span>
          </p>
        )}
      </div>
    </div>
  );

  const renderDescription = () => {
    if (!description) return null;

    return (
      <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
        <h2 className="text-2xl font-semibold text-white mb-4">About</h2>
        <p className="text-white/80 text-lg leading-relaxed">
          {description}
        </p>
      </div>
    );
  };

  const renderPurpose = () => {
    if (!purpose) return null;

    return (
      <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
        <h2 className="text-2xl font-semibold text-white mb-4">Purpose</h2>
        <p className="text-white/80 text-lg leading-relaxed">
          {purpose}
        </p>
      </div>
    );
  };

  const renderTechStack = () => {
    if (!techStack || techStack.length === 0) return null;

    return (
      <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
        <h2 className="text-2xl font-semibold text-white mb-6">Technologies</h2>
        <div className="flex flex-wrap gap-3">
          {techStack.map((tech, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#F4B71A]/20 to-[#1AF4E6]/20 border border-white/20 backdrop-blur-sm"
            >
              <span className="text-white font-medium">{tech}</span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  const renderTeamMembers = () => {
    if (!members || members.length === 0) return null;

    return (
      <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
        <h2 className="text-2xl font-semibold text-white mb-6">Team Members</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {members.map((person, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center justify-between p-4 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 transition-colors"
            >
              <div>
                <p className="text-white font-semibold">{person.name}</p>
                <p className="text-[#1AF4E6] text-sm">{person.role || 'Team Member'}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  const renderFooter = () => (
    <div className="px-8 py-6 bg-white/5 border-t border-white/10 rounded-b-3xl">
      <div className="flex justify-center">
        <motion.button
          onClick={onClose}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-3 rounded-2xl bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] text-black font-semibold hover:shadow-lg hover:shadow-[#F4B71A]/30 transition-all duration-200"
        >
          Close
        </motion.button>
      </div>
    </div>
  );

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={BACKDROP_VARIANTS}
      onClick={handleBackdropClick}
    >
      <motion.div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-lg border border-white/10 shadow-2xl"
        variants={MODAL_VARIANTS}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={handleModalClick}
      >
        {renderHeader()}

        <div className="px-8 pb-8 space-y-8">
          {renderDescription()}
          {renderPurpose()}
          {renderTechStack()}
          {renderTeamMembers()}
        </div>

        {renderFooter()}
      </motion.div>
    </motion.div>
  );
}
