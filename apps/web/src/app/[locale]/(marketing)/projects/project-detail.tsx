import { Project } from './data';
import DemoProjectImage from './demo.png';
import { Separator } from '@repo/ui/components/ui/separator';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface ProjectDetailProps {
  onClose: () => void;
  data: Project | undefined;
}

export default function ProjectDetail({ onClose, data }: ProjectDetailProps) {
  if (!data) {
    return null;
  }
  const { name, description } = data;
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="mx-auto w-2/3 max-w-3xl rounded-lg bg-[#262A3A] p-6 text-center md:w-[90%]"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-extrabold text-white md:text-3xl lg:text-4xl">
          {name}
        </h2>
        <Separator className="my-2" />
        <p className="mb-4 text-base md:text-xl lg:text-2xl">{description}</p>
        <Image
          src={DemoProjectImage}
          alt="Demo Project"
          className="grounded-lg rounded-lg object-cover"
        />
      </motion.div>
    </motion.div>
  );
}
