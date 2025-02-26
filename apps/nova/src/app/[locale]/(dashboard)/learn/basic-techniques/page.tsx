import { LessonContent } from '@/components/learn/lesson-content';

const lessonData = {
  title: 'Basic Techniques in Prompt Engineering',
  sections: [
    {
      title: '1. Zero-shot Prompting',
      content:
        "Zero-shot prompting involves asking the AI to perform a task without providing specific examples. This technique relies on the model's pre-existing knowledge to generate responses.",
    },
    {
      title: '2. Few-shot Prompting',
      content:
        "Few-shot prompting includes providing a small number of examples within the prompt to guide the AI's response. This technique helps the model understand the desired format and style of the output.",
    },
    {
      title: '3. Chain-of-Thought Prompting',
      content:
        'Chain-of-thought prompting encourages the AI to break down complex problems into smaller, logical steps. This technique is particularly useful for problem-solving and reasoning tasks.',
    },
    {
      title: '4. Role-playing Prompts',
      content:
        'Role-playing prompts involve asking the AI to assume a specific persona or role when generating responses. This can be useful for creating diverse perspectives or specialized knowledge outputs.',
    },
  ],
};

export default function BasicTechniquesPage() {
  return <LessonContent lesson={lessonData} />;
}
