import { motion } from 'framer-motion';
import { Brain, Lightbulb, Microscope, Puzzle } from 'lucide-react';

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

interface ResearchQuestionProps {
  icon: React.ElementType;
  number: string;
  question: string;
  description: string;
  objectives: string[];
  color?: string;
  bgColor?: string;
}

const ResearchQuestion = ({
  icon: Icon,
  number,
  question,
  description,
  objectives,
  color = 'text-primary',
  bgColor = 'bg-primary/10',
}: ResearchQuestionProps) => (
  <motion.div
    variants={item}
    className="bg-foreground/5 hover:bg-foreground/10 flex flex-col gap-4 rounded-xl p-6 transition-colors"
  >
    <div className="flex items-start gap-4">
      <div className={`${bgColor} ${color} mt-1 rounded-lg p-2`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`${color} font-semibold`}>{number}</span>
          <h3 className="font-medium">{question}</h3>
        </div>
        <p className="text-foreground/60 text-sm">{description}</p>
      </div>
    </div>
    <div className="pl-14">
      <div className="text-foreground/80 space-y-2 text-sm">
        {objectives.map((objective, index) => (
          <motion.div
            key={objective}
            variants={item}
            className="flex items-center gap-2"
          >
            <div
              className={`${color} flex h-5 w-5 items-center justify-center rounded-full text-xs`}
            >
              {String.fromCharCode(97 + index)}
            </div>
            <span>{objective}</span>
          </motion.div>
        ))}
      </div>
    </div>
  </motion.div>
);

export const researchQuestionsSlide = {
  title: 'Research Questions',
  subtitle: 'Key Areas of Investigation',
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
        Our research focuses on four key questions to advance jute pest
        classification using computer vision and deep learning.
      </motion.div>

      <motion.div variants={container} className="space-y-4">
        <ResearchQuestion
          icon={Microscope}
          number="RQ1"
          question="What are the morphological features that differentiate Jute pest species?"
          description="Investigating distinctive physical characteristics across different pest species in our dataset to establish reliable identification markers."
          objectives={[
            'Analyze shape-based features and their variations',
            'Study color distribution patterns',
            'Examine texture characteristics',
            'Quantify feature importance',
          ]}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />

        <ResearchQuestion
          icon={Lightbulb}
          number="RQ2"
          question="To what extent do environmental conditions affect feature visibility?"
          description="Analyzing the impact of varying environmental conditions on the reliability and consistency of pest feature detection."
          objectives={[
            'Evaluate lighting condition effects',
            'Assess background variation impact',
            'Measure feature stability',
            'Determine optimal conditions',
          ]}
          color="text-amber-500"
          bgColor="bg-amber-500/10"
        />

        <ResearchQuestion
          icon={Puzzle}
          number="RQ3"
          question="Which combinations of image features show the strongest statistical associations?"
          description="Identifying and validating the most reliable feature combinations for accurate pest species classification."
          objectives={[
            'Calculate feature correlations',
            'Identify optimal feature combinations',
            'Validate statistical significance',
            'Determine feature importance weights',
          ]}
          color="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />

        <ResearchQuestion
          icon={Brain}
          number="RQ4"
          question="Do morphological features significantly differ between pest species?"
          description="Quantifying and validating the statistical significance of morphological differences between pest species."
          objectives={[
            'Conduct morphometric analysis',
            'Perform statistical testing',
            'Calculate effect sizes',
            'Establish classification criteria',
          ]}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
        />
      </motion.div>
    </motion.div>
  ),
};
