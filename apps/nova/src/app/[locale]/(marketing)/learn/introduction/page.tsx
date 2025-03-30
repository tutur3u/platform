import { LessonContent } from '@/components/learn/lesson-content';

const lessonData = {
  title: 'Introduction to Prompt Engineering',
  sections: [
    {
      title: 'What is a Prompt',
      content: [
        "A prompt is a natural language input that instructs a generative AI on the task at hand. These AI models can create a variety of content like stories, conversations, videos, and more. The quality of the output depends on the prompt's clarity and context, as AI models need accurate details to produce meaningful and precise responses.",
        'Prompt engineering is about refining prompts to ensure the AI generates useful content that addresses user needs and reduces errors, enhancing the overall customer experience.',
      ],
    },
    {
      title: 'What is Prompt Engineering?',
      content:
        'Prompt engineering involves crafting specific instructions to help generative AI produce the best output. Since AI models aim to mimic human responses, they need clear and detailed directions to generate high-quality, relevant results. Prompt engineers experiment with various input formats, words, and structures to improve how AI interacts with users and performs tasks.',
    },
    {
      title: 'Why is Prompt Engineering Important?',
      content: [
        'The demand for prompt engineers has grown due to advancements in AI. These engineers bridge the gap between users and AI models, crafting prompts that guide the model to produce the best possible output. They develop a library of prompts that can be customized and used by application developers for various situations.',
        'For example, AI chatbots might receive vague queries like "Where to buy a shirt?" An engineered prompt might instruct the chatbot to act as a sales assistant and provide specific store locations. This helps generate more accurate and relevant answers.',
      ],
    },
    {
      title: 'Elements of Prompt Engineering',
      content: [
        '1. Role: Assigning a persona to the AI to guide its response style.',
        '\t Example: "You are a technical support specialist: A customer is asking about troubleshooting software issues."',
        '2. Instruction/Task: Defining the specific action the AI should take',
        '\t Example: "Write a product description for a new smartphone highlighting key features and benefits."',
        '3. Questions: Framing a prompt as a question to guide the AI’s response.',
        '\t Example: "What are the risks of a high-sodium diet?"',
        '4. Context: Providing additional information to make the response more accurate and relevant.',
        '\t Example: "Given the patient’s medical history, suggest potential treatment options."',
        '5. Example: Offering examples to clarify the desired response type.',
        '\t Example: "Given the beginning and ending of a story, fill in the narrative with plot details and character development."',
        'By incorporating these elements into prompts, prompt engineers ensure the AI produces accurate, contextually appropriate, and meaningful responses, improving AI applications across different domains.',
        'Reference: https://www.spiceworks.com/tech/artificial-intelligence/articles/what-is-prompt-engineering/',
      ],
    },
  ],
};

export default function IntroductionPage() {
  return <LessonContent lesson={lessonData} />;
}
