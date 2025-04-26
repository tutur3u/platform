import { LessonContent } from '@/components/learn/lesson-content';

const lessonData = {
  title: 'Best Practices in Prompt Engineering',
  sections: [
    {
      title: 'How to Craft Effective Prompts',
      content: [
        '### Give LLM a Persona',
        'Assigning a persona helps LLM respond from a particular perspective, making it easier to tailor answers to specific scenarios or audiences.',
        'Example: "You are a data analyst for our marketing team. Provide a summary of last quarter’s campaign performance, emphasizing metrics relevant to future planning."',
        '',
        '### Add Delimiters',
        'Delimiters (e.g., triple quotes) help distinguish specific sections of text that need to be processed differently, like translation or summarization.',
        'Example: "Translate the text delimited by triple quotes to French:"',
        '“”“Yes we will schedule the meeting next Friday and review your updates to the project plan. Please invite your contacts from the product team and be ready to share next steps.””“',
        '',
        '### Provide Step-by-Step Instructions',
        'This technique, known as chain-of-thought prompting, breaks down complex tasks into manageable steps, encouraging reasoning and intermediate steps.',
        'Example: "Step 1: Read the text. Step 2: Provide feedback on grammar. Step 3: Rewrite the text with edits. Step 4: Translate the text to French and Spanish."',
        '',
        '### Provide Examples',
        'One-shot or few-shot prompting uses examples to give context and guide the model in understanding the task.',
        'Example: "Summarize the topic and mood of the text below:"',
        '“”“A molecule, imagine this, is an astonishingly miniscule building block—so diminutive, it’s invisible! Yet, it’s the cornerstone of existence! These specks congregate to conjure, well, everything!””“',
        'Topic: Molecules',
        'Mood: Amazement',
      ],
    },
    {
      title: 'General Best Practices',
      content: [
        '### Be Clear and Specific',
        'Clearly communicate your request with precise language. Avoid ambiguity and provide enough context for accurate responses.',
        '',
        '### Iterative Refinement',
        'Start with an initial prompt, review the response, and refine the prompt as needed. Adjust wording or add more context to improve results.',
        '',
        '### Requesting a Different Tone',
        'Specify the desired tone with descriptive adjectives (e.g., formal, friendly, professional) to guide the model’s style.',
        'Example: "Explain this in a friendly and engaging tone."',
      ],
    },
  ],
};

export default function BestPracticesPage() {
  return <LessonContent lesson={lessonData} />;
}
