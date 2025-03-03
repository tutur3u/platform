import { LessonContent } from '@/components/learn/lesson-content';

const lessonData = {
  title: 'Basic Techniques in Prompt Engineering',
  sections: [
    {
      title: '1. Zero-shot Prompting',
      content:
        "Zero-shot prompting involves asking the AI to perform a task without providing specific examples. This technique relies on the model's pre-existing knowledge to generate responses. It is useful when exploring the model's broad understanding of topics but can sometimes lead to unpredictable or less accurate outputs. To improve zero-shot responses, users should phrase prompts clearly, specify constraints, and provide additional context when necessary.",
    },
    {
      title: '2. Few-shot Prompting',
      content:
        "Few-shot prompting includes providing a small number of examples within the prompt to guide the AI's response. By incorporating a few demonstrations, the AI can better understand the desired structure, tone, and context. This technique improves response accuracy and helps the model generalize based on limited examples. Effective few-shot prompting includes selecting high-quality examples and structuring them clearly to achieve the best results.",
    },
    {
      title: '3. Chain-of-Thought Prompting',
      content:
        "Chain-of-thought (CoT) prompting encourages the AI to break down complex problems into smaller, logical steps. Instead of generating a direct answer, the AI outlines a step-by-step reasoning process, leading to more accurate and transparent responses. This technique is particularly effective for mathematical reasoning, logical deduction, and multi-step problem-solving. Users can enhance CoT prompting by explicitly instructing the AI to 'explain its thought process' or 'show step-by-step reasoning' before concluding.",
    },
    {
      title: '4. Role-playing Prompts',
      content:
        "Role-playing prompts involve asking the AI to assume a specific persona or role when generating responses. This is useful for simulating expert opinions, historical figures, customer service agents, or other specialized perspectives. By specifying a role (e.g., 'Answer as a legal consultant'), the AI can generate more contextually relevant and authoritative responses. To further refine role-playing prompts, users can include additional instructions regarding tone, expertise level, and response style.",
    },
    {
      title: '5. Instruction-based Prompting',
      content:
        'Instruction-based prompting involves giving clear, detailed instructions to guide the AI toward the desired response. Unlike general prompts, this technique ensures that the AI follows specific directives, such as formatting requirements, tone preferences, or content constraints. Well-structured instructions improve response quality and consistency. Users can enhance instruction-based prompts by specifying output length, defining required elements, and avoiding ambiguity.',
    },
    {
      title: '6. Contextual Prompting',
      content:
        'Contextual prompting provides additional background information within the prompt to improve the AI’s understanding and relevance of responses. This can include defining key terms, setting a narrative context, or embedding previous exchanges in multi-turn conversations. Context-rich prompts improve coherence and allow AI to generate more informed responses based on user intent. A good practice is to frame context concisely while ensuring all necessary information is included.',
    },
  ],
};

export default function BasicTechniquesPage() {
  return <LessonContent lesson={lessonData} />;
}
