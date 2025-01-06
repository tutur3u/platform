import { LessonContent } from '@/components/learn/lesson-content';

const lessonData = {
  title: 'Advanced Strategies in Prompt Engineering',
  sections: [
    {
      title: '1. Iterative Refinement',
      content:
        "Iterative refinement involves gradually improving prompts based on the AI's outputs. This strategy helps in fine-tuning prompts for optimal results through multiple iterations.",
    },
    {
      title: '2. Prompt Chaining',
      content:
        'Prompt chaining is the technique of using the output from one prompt as input for another. This allows for more complex, multi-step tasks to be broken down into manageable parts.',
    },
    {
      title: '3. Constrained Generation',
      content:
        "Constrained generation involves setting specific parameters or rules for the AI's output. This can include limiting the response length, specifying a particular format, or requiring the use of certain keywords.",
    },
    {
      title: '4. Meta-prompting',
      content:
        'Meta-prompting is the practice of using prompts to generate other prompts. This advanced technique can be used to create more diverse and creative prompts automatically.',
    },
  ],
};

export default function AdvancedStrategiesPage() {
  return <LessonContent lesson={lessonData} />;
}
