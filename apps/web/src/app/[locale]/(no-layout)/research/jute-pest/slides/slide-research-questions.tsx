import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Brain,
  Camera,
  ChartBar,
  Code2,
  Database,
  FileImage,
  Filter,
  Layers,
  Network,
  Scale,
  Search,
  Target,
  TestTube,
} from 'lucide-react';

const ResearchQuestion = ({
  number,
  icon: Icon,
  color,
  title,
  description,
  objectives,
}: {
  number: number;
  icon: any;
  color: string;
  title: string;
  description: string;
  objectives: string[];
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: number * 0.1 }}
    className="bg-foreground/5 hover:bg-foreground/10 group relative overflow-hidden rounded-xl p-6 transition-colors"
  >
    <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 opacity-5">
      <Icon className="h-32 w-32" />
    </div>
    <div className="mb-4 flex items-center gap-3">
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold',
          color.replace('text-', 'bg-') + '/10',
          color
        )}
      >
        {number}
      </div>
      <div>
        <h4 className="font-medium">{title}</h4>
        <p className="text-foreground/60 text-sm">{description}</p>
      </div>
    </div>
    <ul className="space-y-2">
      {objectives.map((objective, i) => (
        <motion.li
          key={objective}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          className="flex items-center gap-2"
        >
          <div
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full text-xs',
              color.replace('text-', 'bg-') + '/10',
              color
            )}
          >
            {String.fromCharCode(97 + i)}
          </div>
          <span className="text-foreground/80 text-sm">{objective}</span>
        </motion.li>
      ))}
    </ul>
  </motion.div>
);

const MethodologyStep = ({
  icon: Icon,
  color,
  title,
  description,
}: {
  icon: any;
  color: string;
  title: string;
  description: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-center gap-4"
  >
    <div
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
        color.replace('text-', 'bg-') + '/10'
      )}
    >
      <Icon className={cn('h-6 w-6', color)} />
    </div>
    <div>
      <h4 className="font-medium">{title}</h4>
      <p className="text-foreground/60 text-sm">{description}</p>
    </div>
  </motion.div>
);

const Divider = () => (
  <div className="text-foreground/40">
    <ArrowRight className="h-4 w-4" />
  </div>
);

export const researchQuestionsSlide = {
  id: 'research-questions',
  title: '🔍 Research Questions',
  subtitle: 'Key Objectives & Methodology',
  content: (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-center text-xl font-bold">Research Flow</h3>
        <div className="flex items-center justify-center gap-4 text-sm">
          <MethodologyStep
            icon={Camera}
            color="text-blue-500"
            title="Data Collection"
            description="High-quality pest images"
          />
          <Divider />
          <MethodologyStep
            icon={Filter}
            color="text-purple-500"
            title="Preprocessing"
            description="Image enhancement"
          />
          <Divider />
          <MethodologyStep
            icon={Brain}
            color="text-emerald-500"
            title="Analysis"
            description="Feature extraction"
          />
          <Divider />
          <MethodologyStep
            icon={Target}
            color="text-orange-500"
            title="Validation"
            description="Statistical testing"
          />
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        <ResearchQuestion
          number={1}
          icon={FileImage}
          color="text-blue-500"
          title="Feature Extraction"
          description="What are the most distinctive morphological features for jute pest classification?"
          objectives={[
            'Identify key shape-based features',
            'Extract color distribution patterns',
            'Analyze texture characteristics',
            'Evaluate feature importance',
          ]}
        />
        <ResearchQuestion
          number={2}
          icon={Layers}
          color="text-purple-500"
          title="Environmental Impact"
          description="How do environmental conditions affect feature stability?"
          objectives={[
            'Assess lighting condition effects',
            'Evaluate background variations',
            'Measure feature robustness',
            'Quantify environmental impact',
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ResearchQuestion
          number={3}
          icon={Network}
          color="text-emerald-500"
          title="Classification Model"
          description="Which deep learning architecture performs best for pest classification?"
          objectives={[
            'Compare model architectures',
            'Optimize hyperparameters',
            'Evaluate transfer learning',
            'Analyze model performance',
          ]}
        />
        <ResearchQuestion
          number={4}
          icon={ChartBar}
          color="text-orange-500"
          title="Statistical Analysis"
          description="Are the morphological differences statistically significant?"
          objectives={[
            'Conduct ANOVA testing',
            'Perform post-hoc analysis',
            'Calculate effect sizes',
            'Validate findings',
          ]}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-foreground/5 rounded-xl p-6"
      >
        <h3 className="mb-6 text-lg font-bold">Expected Outcomes</h3>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-6">
            <MethodologyStep
              icon={Database}
              color="text-blue-500"
              title="Feature Database"
              description="Comprehensive morphological feature repository"
            />
            <MethodologyStep
              icon={Scale}
              color="text-emerald-500"
              title="Statistical Evidence"
              description="Validated feature significance and relationships"
            />
          </div>
          <div className="space-y-6">
            <MethodologyStep
              icon={Brain}
              color="text-purple-500"
              title="Optimized Model"
              description="High-accuracy classification system"
            />
            <MethodologyStep
              icon={Search}
              color="text-orange-500"
              title="Best Practices"
              description="Guidelines for feature selection and analysis"
            />
          </div>
          <div className="space-y-6">
            <MethodologyStep
              icon={TestTube}
              color="text-amber-500"
              title="Methodology"
              description="Reproducible research framework"
            />
            <MethodologyStep
              icon={Code2}
              color="text-violet-500"
              title="Implementation"
              description="Open-source analysis toolkit"
            />
          </div>
        </div>
      </motion.div>
    </div>
  ),
};
