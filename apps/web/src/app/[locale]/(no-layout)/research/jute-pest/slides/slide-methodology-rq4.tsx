import { motion } from 'framer-motion';
import { Camera, Ruler, Scale, Target } from 'lucide-react';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

const MethodStep = ({
  icon: Icon,
  title,
  description,
  steps,
  color = 'text-primary',
  bgColor = 'bg-primary/10',
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  steps: string[];
  color?: string;
  bgColor?: string;
}) => (
  <motion.div
    variants={item}
    className="bg-foreground/5 hover:bg-foreground/10 flex flex-col gap-4 rounded-xl p-6 transition-colors"
  >
    <div className="flex items-start gap-4">
      <div className={`${bgColor} ${color} mt-1 rounded-lg p-2`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1 space-y-2">
        <h3 className="font-medium">{title}</h3>
        <p className="text-foreground/60 text-sm">{description}</p>
      </div>
    </div>
    <div className="pl-14">
      <div className="text-foreground/80 space-y-2 text-sm">
        {steps.map((step, index) => (
          <motion.div
            key={step}
            variants={item}
            className="flex items-center gap-2"
          >
            <div
              className={`${color} flex h-5 w-5 items-center justify-center rounded-full text-xs`}
            >
              {index + 1}
            </div>
            <span>{step}</span>
          </motion.div>
        ))}
      </div>
    </div>
  </motion.div>
);

export const methodologyRQ4Slide = {
  title: 'RQ4: Methodology',
  subtitle: 'Analyzing Morphological Differences Between Species',
  content: (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <motion.div
        variants={item}
        className="text-foreground/80 text-center text-lg"
      >
        Our systematic approach to quantifying and validating morphological
        differences between pest species involves the following key steps:
      </motion.div>

      <motion.div variants={container} className="space-y-4">
        <MethodStep
          icon={Camera}
          title="Data Collection & Preprocessing"
          description="Standardized image capture and preparation for morphological analysis."
          steps={[
            'Capture high-resolution images under controlled conditions',
            'Apply image enhancement and normalization',
            'Segment pest regions from background',
            'Extract region of interest for analysis',
          ]}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />

        <MethodStep
          icon={Ruler}
          title="Morphometric Analysis"
          description="Comprehensive measurement and analysis of physical characteristics."
          steps={[
            'Measure body length, width, and segment proportions',
            'Calculate shape descriptors and ratios',
            'Extract color and texture features',
            'Document species-specific patterns',
          ]}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
        />

        <MethodStep
          icon={Scale}
          title="Statistical Analysis"
          description="Rigorous statistical testing to validate morphological differences."
          steps={[
            'Perform one-way ANOVA for feature comparison',
            'Conduct post-hoc tests for pairwise analysis',
            'Calculate effect sizes and confidence intervals',
            'Validate results through cross-validation',
          ]}
          color="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />

        <MethodStep
          icon={Target}
          title="Feature Validation"
          description="Verification and documentation of distinguishing characteristics."
          steps={[
            'Identify most discriminative features',
            'Establish classification thresholds',
            'Create species-specific morphological profiles',
            'Document feature reliability metrics',
          ]}
          color="text-amber-500"
          bgColor="bg-amber-500/10"
        />
      </motion.div>
    </motion.div>
  ),
};
