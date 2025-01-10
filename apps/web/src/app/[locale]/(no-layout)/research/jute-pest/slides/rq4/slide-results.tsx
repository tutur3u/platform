import { motion } from 'framer-motion';
import { BarChart3, Brain, Microscope, Target } from 'lucide-react';

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

const ResultCard = ({
  icon: Icon,
  title,
  findings,
  color = 'text-primary',
  bgColor = 'bg-primary/10',
}: {
  icon: React.ElementType;
  title: string;
  findings: string[];
  color?: string;
  bgColor?: string;
}) => (
  <motion.div
    variants={item}
    className="bg-foreground/5 hover:bg-foreground/10 rounded-xl p-6 transition-colors"
  >
    <div className="mb-4 flex items-center gap-3">
      <div className={`${bgColor} ${color} rounded-lg p-2`}>
        <Icon className="h-5 w-5" />
      </div>
      <h4 className="font-medium">{title}</h4>
    </div>
    <ul className="text-foreground/80 space-y-2 text-sm">
      {findings.map((finding) => (
        <motion.li
          key={finding}
          variants={item}
          className="flex items-center gap-2"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-xs text-emerald-500">
            ✓
          </div>
          <span>{finding}</span>
        </motion.li>
      ))}
    </ul>
  </motion.div>
);

export const rq4ResultsSlide = {
  title: 'RQ4: Key Findings',
  subtitle: 'Morphological Feature Analysis Results',
  content: (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div
        variants={item}
        className="text-foreground/80 text-center text-lg"
      >
        Our comprehensive morphological analysis confirms statistically
        significant differences between pest species, enabling reliable
        identification through physical characteristics.
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <ResultCard
          icon={Microscope}
          title="Primary Findings"
          findings={[
            'Significant morphological variations between species (p < 0.001)',
            'Distinct size ranges and proportions for each species',
            'Species-specific segment patterns and counts',
            'Unique combinations of physical traits per species',
          ]}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />

        <ResultCard
          icon={Brain}
          title="Feature Effectiveness"
          findings={[
            'Shape descriptors provide 91% discrimination accuracy',
            'Color patterns show high species specificity (85%)',
            'Texture features offer reliable secondary markers',
            'Combined features achieve 95% identification rate',
          ]}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
        />

        <ResultCard
          icon={BarChart3}
          title="Statistical Evidence"
          findings={[
            'Strong effect sizes across all features (η² > 0.80)',
            'Robust cross-validation results (95% CI)',
            'High inter-rater reliability (κ = 0.89)',
            'Minimal overlap between species clusters',
          ]}
          color="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />

        <ResultCard
          icon={Target}
          title="Research Impact"
          findings={[
            'Established quantitative identification criteria',
            'Created comprehensive morphological profiles',
            'Developed standardized measurement protocols',
            'Enabled reliable automated classification',
          ]}
          color="text-amber-500"
          bgColor="bg-amber-500/10"
        />
      </div>
    </motion.div>
  ),
};
