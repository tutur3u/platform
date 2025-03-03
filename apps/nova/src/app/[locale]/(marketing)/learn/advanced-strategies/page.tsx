import { LessonContent } from '@/components/learn/lesson-content';

const lessonData = {
  title: 'Advanced Strategies in Prompt Engineering',
  sections: [
    {
      title: '1. Iterative Refinement',
      content:
        'Iterative refinement involves continuously improving prompts based on AI-generated outputs. By analyzing responses, adjusting phrasing, and incorporating structured feedback loops, this method enhances precision and reliability in AI interactions. Effective iterative refinement often includes A/B testing prompts and leveraging self-correction mechanisms in AI responses.',
    },
    {
      title: '2. Prompt Chaining',
      content:
        'Prompt chaining links multiple prompts together, where the output of one serves as the input for the next. This is particularly useful for complex workflows, multi-step reasoning, or breaking down large tasks into sequential steps. It enhances AI reasoning, ensures better contextual continuity, and improves response coherence over long interactions.',
    },
    {
      title: '3. Constrained Generation',
      content:
        'Constrained generation sets strict boundaries for AI outputs using rules, specific instructions, or delimiters. This can include controlling output length, enforcing structured formatting (e.g., JSON, tables), requiring specific terminology, or avoiding undesired topics. Such techniques ensure outputs align with user expectations and practical use cases, reducing inconsistencies.',
    },
    {
      title: '4. Meta-Prompting',
      content:
        'Meta-prompting involves using AI to generate new prompts, effectively leveraging AI to enhance its own prompting capabilities. This technique is useful for generating diverse creative prompts, automating prompt engineering, and optimizing model interactions dynamically. It’s often used in creative applications, research, and AI-driven automation processes.',
    },
    {
      title: '5. Self-Consistency Prompting',
      content:
        'Self-consistency prompting involves generating multiple outputs for the same prompt and selecting the most consistent or high-quality response. By sampling various AI-generated responses and comparing them, users can ensure a more reliable final answer. This technique is particularly effective for reasoning-intensive tasks such as logical problem-solving and complex decision-making.',
    },
    {
      title: '6. Multi-Turn Conversational Prompting',
      content:
        'Multi-turn conversational prompting creates a structured dialogue with AI over multiple exchanges, allowing the model to build on prior responses. This is essential for chatbot design, extended knowledge retrieval, and applications where sustained context is necessary. Techniques such as memory reinforcement and progressive elaboration are commonly used.',
    },
    {
      title: '7. Negative Prompting',
      content:
        'Negative prompting explicitly instructs AI on what NOT to generate, ensuring unwanted biases or irrelevant content are minimized. This is useful for content moderation, ensuring focus in AI-generated outputs, and guiding AI to refine ambiguous responses. Combining negative prompting with strong constraints leads to more reliable outputs.',
    },
  ],
};

export default function AdvancedStrategiesPage() {
  return <LessonContent lesson={lessonData} />;
}
