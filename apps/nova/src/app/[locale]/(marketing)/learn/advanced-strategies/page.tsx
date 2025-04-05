import { LessonContent } from '@/components/learn/lesson-content';

const lessonData = {
  title: 'Advanced Strategies in Prompt Engineering',
  sections: [
    {
      title: 'Prompt Engineering for Generative AI',
      content: [
        'Prompt engineering is the practice of crafting effective prompts to get the best results from a Large Language Model (LLM). It enables users to interact with LLMs using plain language. Unlike traditional machine learning, where technical knowledge is essential, prompt engineering can be done in everyday language.',
        'Estimated Read Time: 20 minutes',
        'Learning Objectives:',
        '- Understand basic prompting techniques.',
        '- Apply best practices to craft effective prompts.',
        'Being a great prompt engineer doesn’t require coding. Creativity and persistence are key. Below are best practices and techniques to improve your prompting skills.',
      ],
    },
    {
      title: 'Prompting Best Practices',
      content: [
        '- **Clearly Define the Focus**: Emphasize the key content or information you need.',
        '- **Structure the Prompt**: Start with the role of the model, then provide context and instructions.',
        "- **Provide Specific Examples**: Use varied examples to narrow the model's focus.",
        '- **Use Constraints**: Limit the output to avoid inaccuracies.',
        '- **Break Down Tasks**: Divide complex tasks into simpler steps.',
        '- **Self-Assessment**: Instruct the model to evaluate its response (e.g., "Is this answer correct?").',
        '- **Be Creative**: Experiment and adapt for better results, as LLMs and prompting techniques evolve.',
      ],
    },
    {
      title: 'Types of Prompts',
      content: [
        '### Direct Prompting (Zero-shot)',
        'The simplest form of prompting with no prior examples. You provide just the instruction or role.',
        'Example: "Can you list blog post ideas for first-time tourists in NYC?"',
        'Role Prompting Example: "You are a prompt-generating robot. Design a prompt after understanding my goals."',

        '### Prompting with Examples',
        'One-shot: Show the model a single example to follow.',
        'Example: "List blog ideas for NYC tourism, e.g., \'Where to stay on your first visit.\'"',

        'Few-shot & Multi-shot: Provide multiple examples for more complex tasks.',
        "Example: \"Classify these reviews: 'Great product, 10/10' = Positive, 'Didn't work' = Negative.\"",

        '### Chain-of-Thought Prompting',
        'Encourages the model to explain its reasoning, improving results for complex tasks.',
        'Example: "The odd numbers in this group add up to an even number: 4, 8, 9, 15, 12, 2, 1."',
        'Reasoning: Add the odd numbers (9 + 15 + 1 = 25). False.',

        '### Zero-shot Chain-of-Thought (CoT)',
        'Adds a step-by-step instruction to a zero-shot prompt to improve accuracy.',
        'Example: "I bought 10 apples, gave 2 away, bought 5 more, ate 1. How many do I have left? Let\'s think step by step."',
      ],
    },
    {
      title: 'Prompt Iteration Strategies',
      content: [
        '- **Refine and Repeat**: Modify prompts several times to get the desired output.',
        '- **Clarify Output Format**: Specify formats (e.g., CSV, JSON).',
        '- **Use Emphasis**: Highlight important instructions using capitalization or exaggeration.',
        '- **Synonyms**: Swap words or phrases to improve response quality.',
        '- **Sandwich Technique**: Repeat important points at different places in the prompt.',
        '- **Use prompt libraries** like Prompt Hero for inspiration and improvement.',
        'By following these guidelines and techniques, you can enhance your ability to work with LLMs effectively, even without coding experience.',
      ],
    },
  ],
};

export default function AdvancedStrategiesPage() {
  return <LessonContent lesson={lessonData} />;
}
