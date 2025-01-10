import { motion } from 'framer-motion';
import { Brain, Bug, Database, Shield, Sparkles, Target } from 'lucide-react';

const HighlightCard = ({
  icon: Icon,
  title,
  value,
  description,
  color = 'text-primary',
  bgColor = 'bg-primary/10',
}: {
  icon: any;
  title: string;
  value: string;
  description: string;
  color?: string;
  bgColor?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.05 }}
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
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
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
  id: 'title',
  content: (
    <div className="flex flex-col items-center justify-center gap-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="max-w-4xl space-y-8 text-center"
      >
        <div className="relative">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 20,
              delay: 0.2,
            }}
            className="from-primary/20 absolute inset-0 -z-10 rounded-full bg-gradient-to-br via-transparent to-transparent opacity-50 blur-3xl"
          />
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mb-4"
          >
            <span className="bg-gradient-to-r from-emerald-500 to-emerald-700 bg-clip-text text-xl font-semibold text-transparent">
              Research Methods for Engineers
            </span>
          </motion.div>
          <h2 className="from-foreground to-foreground/70 bg-gradient-to-br bg-clip-text text-5xl font-bold text-transparent md:text-6xl">
            Unveiling the Secrets of Jute Pest Classification
          </h2>
        </div>

        <p className="text-foreground/80 text-xl font-medium leading-relaxed md:text-2xl">
          A Data-Driven Approach to Sustainable Pest Management
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
        </div>

        <div className="mt-12 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap justify-center gap-4"
          >
            <TeamMember name="Doan Huu Quoc" role="Team Lead" />
            <TeamMember name="Vo Hoang Phuc" role="ML Engineer" />
            <TeamMember name="Nguyen Dinh Viet" role="Data Scientist" />
            <TeamMember name="Phan Trong Nguyen" role="Research Lead" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-foreground/60 space-y-2 text-sm"
          >
            <div className="flex items-center justify-center gap-8">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>EEET2485 – Research Methods for Engineers</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span>RMIT University Vietnam</span>
              </div>
            </div>
            <p>School of Technology • Semester 2024C • January 16, 2025</p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  ),
};
