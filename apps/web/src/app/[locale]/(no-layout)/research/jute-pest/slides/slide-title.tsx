import { motion } from 'framer-motion';
import {
  Brain,
  Bug,
  Cpu,
  Database,
  School,
  Shield,
  Target,
} from 'lucide-react';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.3,
    },
  },
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

const HighlightCard = ({
  icon: Icon,
  title,
  value,
  description,
  color = 'text-primary',
  bgColor = 'bg-primary/10',
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  description: string;
  color?: string;
  bgColor?: string;
}) => (
  <motion.div
    variants={item}
    className="bg-foreground/5 hover:bg-foreground/10 flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-colors"
  >
    <div className={`${bgColor} ${color} rounded-lg p-2`}>
      <Icon className="h-6 w-6" />
    </div>
    <h3 className="font-medium">{title}</h3>
    <p className="text-2xl font-bold">{value}</p>
    <p className="text-foreground/60 text-sm">{description}</p>
  </motion.div>
);

const TeamMember = ({ name, role }: { name: string; role: string }) => (
  <motion.div
    variants={item}
    className="bg-foreground/5 hover:bg-foreground/10 rounded-full px-4 py-2 transition-colors"
  >
    <div className="text-sm">
      <span className="font-medium">{name}</span>
      <span className="text-foreground/60 mx-2">•</span>
      <span className="text-foreground/60">{role}</span>
    </div>
  </motion.div>
);

export const titleSlide = {
  title: 'Jute Pest Detection & Classification',
  subtitle: 'A Deep Learning Approach for Sustainable Agriculture',
  content: (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col items-center justify-center gap-12"
    >
      <motion.div
        variants={item}
        className="grid grid-cols-1 gap-4 md:grid-cols-4"
      >
        <HighlightCard
          icon={Database}
          title="Dataset Size"
          value="7,235"
          description="Validated Images"
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />
        <HighlightCard
          icon={Bug}
          title="Pest Classes"
          value="17"
          description="Distinct Categories"
          color="text-purple-500"
          bgColor="bg-purple-500/10"
        />
        <HighlightCard
          icon={Brain}
          title="Model Accuracy"
          value="97.2%"
          description="Using DenseNet201"
          color="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />
        <HighlightCard
          icon={Target}
          title="Detection Rate"
          value="85%"
          description="Real-time Analysis"
          color="text-orange-500"
          bgColor="bg-orange-500/10"
        />
      </motion.div>

      <motion.div variants={item} className="space-y-6 text-center">
        <div className="flex flex-wrap justify-center gap-4">
          <div className="bg-primary/10 border-primary/20 rounded-full border px-4 py-2 text-sm">
            🌿 Sustainable Agriculture
          </div>
          <div className="bg-primary/10 border-primary/20 rounded-full border px-4 py-2 text-sm">
            🤖 Deep Learning
          </div>
          <div className="bg-primary/10 border-primary/20 rounded-full border px-4 py-2 text-sm">
            🔍 Computer Vision
          </div>
        </div>

        <motion.div
          variants={item}
          className="flex flex-wrap justify-center gap-4"
        >
          <TeamMember name="Doan Huu Quoc" role="Team Lead" />
          <TeamMember name="Vo Hoang Phuc" role="ML Engineer" />
          <TeamMember name="Nguyen Dinh Viet" role="Data Scientist" />
          <TeamMember name="Phan Trong Nguyen" role="Research Lead" />
        </motion.div>

        <motion.div
          variants={item}
          className="text-foreground/60 flex flex-wrap items-center justify-center gap-2 text-sm"
        >
          <div className="flex items-center justify-center gap-8">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>EEET2485 – Research Methods for Engineers</span>
            </div>
            <div className="flex items-center gap-2">
              <School className="h-4 w-4" />
              <span>RMIT University Vietnam</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            <p>School of Technology • Semester 2024C • January 16, 2025</p>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  ),
};
