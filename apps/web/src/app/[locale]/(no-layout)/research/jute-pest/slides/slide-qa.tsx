import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Brain,
  ChartBar,
  Code2,
  Globe,
  HelpCircle,
  MessageCircle,
  MessagesSquare,
  Settings,
  Target,
} from 'lucide-react';

const QuestionCard = ({
  icon: Icon,
  color,
  title,
  questions,
}: {
  icon: any;
  color: string;
  title: string;
  questions: Array<{
    question: string;
    answer: string;
  }>;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-foreground/5 hover:bg-foreground/10 group relative overflow-hidden rounded-xl p-6 transition-colors"
  >
    <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 opacity-5">
      <Icon className="h-32 w-32" />
    </div>
    <div className="mb-4 flex items-center gap-3">
      <div
        className={cn('rounded-lg p-2', color.replace('text-', 'bg-') + '/10')}
      >
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <h4 className="font-medium">{title}</h4>
    </div>
    <div className="space-y-4">
      {questions.map((qa, i) => (
        <motion.div
          key={qa.question}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          className="hover:bg-foreground/5 group relative rounded-lg p-4"
        >
          <div className="mb-2 flex items-start gap-2">
            <HelpCircle className="mt-1 h-4 w-4 shrink-0 text-amber-500" />
            <div className="font-medium">{qa.question}</div>
          </div>
          <div className="ml-6 flex items-start gap-2">
            <MessageCircle className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
            <div className="text-foreground/80 text-sm">{qa.answer}</div>
          </div>
        </motion.div>
      ))}
    </div>
  </motion.div>
);

const TopicMetric = ({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: any;
  color: string;
  value: string;
  label: string;
}) => (
  <motion.div
    whileHover={{ scale: 1.05 }}
    className={cn(
      'bg-foreground/5 hover:bg-foreground/10 group relative overflow-hidden rounded-xl p-6 transition-colors',
      'flex items-center gap-4'
    )}
  >
    <div
      className={cn('rounded-lg p-3', color.replace('text-', 'bg-') + '/10')}
    >
      <Icon className={cn('h-6 w-6', color)} />
    </div>
    <div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-foreground/60 text-sm">{label}</div>
    </div>
  </motion.div>
);

export const qaSlide = {
  id: 'qa',
  title: '💭 Q&A Session',
  subtitle: 'Questions & Discussion',
  content: (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-4">
        <TopicMetric
          icon={MessagesSquare}
          color="text-blue-500"
          value="12"
          label="Total Questions"
        />
        <TopicMetric
          icon={Target}
          color="text-emerald-500"
          value="4"
          label="Research Topics"
        />
        <TopicMetric
          icon={Settings}
          color="text-amber-500"
          value="5"
          label="Technical Aspects"
        />
        <TopicMetric
          icon={Globe}
          color="text-violet-500"
          value="3"
          label="Applications"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <QuestionCard
          icon={Brain}
          color="text-blue-500"
          title="Research Methodology"
          questions={[
            {
              question: 'How were the morphological features selected?',
              answer:
                'Features were selected through a comprehensive analysis using statistical methods and domain expertise, focusing on discriminative characteristics of different pest species.',
            },
            {
              question: 'What validation methods were used?',
              answer:
                'We employed k-fold cross-validation and independent test sets, ensuring robust evaluation of model performance across different scenarios.',
            },
            {
              question: 'How was the dataset balanced?',
              answer:
                'Data augmentation techniques and stratified sampling were used to ensure balanced representation of all pest classes.',
            },
          ]}
        />
        <QuestionCard
          icon={Code2}
          color="text-emerald-500"
          title="Technical Implementation"
          questions={[
            {
              question: 'What deep learning architecture was used?',
              answer:
                'We utilized a custom CNN architecture optimized for pest classification, with transfer learning from pre-trained models.',
            },
            {
              question: 'How was real-time processing achieved?',
              answer:
                'Model optimization techniques including quantization and pruning were applied to achieve efficient inference times.',
            },
            {
              question: 'What was the deployment strategy?',
              answer:
                'The system was deployed using containerization for scalability and edge computing for local processing.',
            },
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <QuestionCard
          icon={ChartBar}
          color="text-amber-500"
          title="Results & Analysis"
          questions={[
            {
              question: 'What metrics were used for evaluation?',
              answer:
                'We used accuracy, precision, recall, F1-score, and confusion matrices to comprehensively evaluate performance.',
            },
            {
              question: 'How does it compare to existing solutions?',
              answer:
                'Our approach showed 15% improvement in accuracy and 40% faster processing compared to current methods.',
            },
            {
              question: 'What were the main challenges?',
              answer:
                'Key challenges included handling environmental variations and maintaining accuracy across different lighting conditions.',
            },
          ]}
        />
        <QuestionCard
          icon={Globe}
          color="text-violet-500"
          title="Practical Applications"
          questions={[
            {
              question: 'How can farmers access this technology?',
              answer:
                'The system will be available through a mobile app and web interface, with offline capabilities for remote areas.',
            },
            {
              question: 'What is the cost of implementation?',
              answer:
                'The solution is designed to be cost-effective, with minimal hardware requirements and free basic access.',
            },
            {
              question: 'Can it be adapted for other crops?',
              answer:
                'Yes, the framework is modular and can be retrained for different crop-pest combinations with minimal modifications.',
            },
          ]}
        />
      </div>
    </div>
  ),
};
