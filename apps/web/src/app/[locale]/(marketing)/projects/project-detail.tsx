import { Project } from './data';
import { Separator } from '@ncthub/ui/separator';
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
  const { name, description, techStack, members } = data;
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-background relative mx-auto h-fit max-h-[90%] w-[98%] max-w-3xl overflow-y-auto rounded-lg p-6 pb-10 text-center md:w-[90%]"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className="absolute right-4 top-2 cursor-pointer text-2xl"
          onClick={onClose}
        >
          x
        </p>
        <Image
          src="/media/background/demo.jpg"
          width={1000}
          height={1000}
          alt="Demo Project"
          className="rounded-lg pt-7"
        />
        <p className="my-4 text-2xl font-extrabold md:text-3xl lg:text-4xl">
          {name}
        </p>
        <Separator className="my-2" />
        <p className="mb-4 px-10 text-base md:text-xl lg:text-xl">
          {description}
        </p>
        <Separator className="my-2" />
        <p className="my-4 text-lg font-semibold md:text-xl lg:text-2xl">
          Technologies
        </p>
        <div className="flex flex-wrap justify-center gap-5">
          {techStack?.map((tech, index) => (
            <div
              key={index}
              className="flex w-1/3 items-center justify-center rounded-3xl px-4 py-2 text-center md:w-1/4"
              style={{
                background:
                  'linear-gradient(180deg, rgba(244,183,26,0.7) 0%, rgba(135,213,128,0.6) 50%, rgba(26,244,230,0.5) 100%)',
              }}
            >
              <p className="whitespace-nowrap text-xs md:text-sm">{tech}</p>
            </div>
          ))}
        </div>

        {members && (
          <div>
            <p className="mt-6 text-lg font-semibold md:text-xl lg:text-2xl">
              Contributors
            </p>
            <Separator className="my-2" />
            <div className="flex flex-col gap-4 py-4 md:px-6">
              {members.map((person, index) => {
                return (
                  <div
                    className="flex items-center justify-between"
                    key={index}
                  >
                    <div className="flex items-center gap-4 md:gap-6">
                      <p className="text-sm md:text-lg">{person.name}</p>
                    </div>
                    <div className="text-sm md:text-lg">
                      {person.role ? person.role : 'Member'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
