import { LessonContent } from '@/components/learn/lesson-content';

const lessonData = {
  title: 'Basic Techniques in Prompt Engineering',
  sections: [
    {
      title: 'What Is Prompt Engineering?',
      content: [
        'Prompt engineering involves crafting specific instructions to help generative AI produce the best output. Since AI models aim to mimic human responses, they need clear and detailed directions to generate high-quality, relevant results. Prompt engineers experiment with various input formats, words, and structures to improve how AI interacts with users and performs tasks.',
      ],
    },
    {
      title: 'What is a Prompt?',
      content: [
        "A prompt is a natural language input that instructs a generative AI on the task at hand. These AI models can create a variety of content like stories, conversations, videos, and more. The quality of the output depends on the prompt's clarity and context, as AI models need accurate details to produce meaningful and precise responses.",
      ],
    },
    {
      title: 'Why Is Prompt Engineering Important?',
      content: [
        'The demand for prompt engineers has grown due to advancements in AI. These engineers bridge the gap between users and AI models, crafting prompts that guide the model to produce the best possible output. They develop a library of prompts that can be customized and used by application developers for various situations.',
        'For example, AI chatbots might receive vague queries like "Where to buy a shirt?" An engineered prompt might instruct the chatbot to act as a sales assistant and provide specific store locations. This helps generate more accurate and relevant answers.',
      ],
    },
    {
      title: 'Elements of Prompt Engineering',
      content: [
        'Prompt engineering involves crafting instructions to ensure AI provides relevant, accurate, and context-aware responses. Key components include:',
        '1. **Role**: Assigning a persona to the AI to guide its response style. Example: _"You are a technical support specialist: A customer is asking about troubleshooting software issues."_,',
        '2. **Instruction/Task**: Defining the specific action the AI should take. Example: _"Write a product description for a new smartphone highlighting key features and benefits."_,',
        '3. **Questions**: Framing a prompt as a question to guide the AI\'s response. Example: _"What are the risks of a high-sodium diet?"_,',
        '4. **Context**: Providing additional information to make the response more accurate and relevant. Example: _"Given the patient\'s medical history, suggest potential treatment options."_,',
        '5. **Example**: Offering examples to clarify the desired response type. Example: _"Given the beginning and ending of a story, fill in the narrative with plot details and character development."_,',
      ],
    },
    {
      title: '1. Zero-shot Prompting',
      content: [
        "Zero-shot prompting involves asking the AI to perform a task without providing specific examples. This technique relies on the model's pre-existing knowledge to generate responses. It is useful when exploring the model's broad understanding of topics but can sometimes lead to unpredictable or less accurate outputs. To improve zero-shot responses, users should phrase prompts clearly, specify constraints, and provide additional context when necessary.",
      ],
    },
    {
      title: '2. Few-shot Prompting',
      content: [
        "Few-shot prompting includes providing a small number of examples within the prompt to guide the AI's response. By incorporating a few demonstrations, the AI can better understand the desired structure, tone, and context. This technique improves response accuracy and helps the model generalize based on limited examples. Effective few-shot prompting includes selecting high-quality examples and structuring them clearly to achieve the best results.",
      ],
    },
    {
      title: '3. Chain-of-Thought Prompting',
      content: [
        "Chain-of-thought (CoT) prompting encourages the AI to break down complex problems into smaller, logical steps. Instead of generating a direct answer, the AI outlines a step-by-step reasoning process, leading to more accurate and transparent responses. This technique is particularly effective for mathematical reasoning, logical deduction, and multi-step problem-solving. Users can enhance CoT prompting by explicitly instructing the AI to 'explain its thought process' or 'show step-by-step reasoning' before concluding.",
      ],
    },
    {
      title: '4. Role-playing Prompts',
      content: [
        "Role-playing prompts involve asking the AI to assume a specific persona or role when generating responses. This is useful for simulating expert opinions, historical figures, customer service agents, or other specialized perspectives. By specifying a role (e.g., 'Answer as a legal consultant'), the AI can generate more contextually relevant and authoritative responses. To further refine role-playing prompts, users can include additional instructions regarding tone, expertise level, and response style.",
      ],
    },
    {
      title: '5. Instruction-based Prompting',
      content: [
        'Instruction-based prompting involves giving clear, detailed instructions to guide the AI toward the desired response. Unlike general prompts, this technique ensures that the AI follows specific directives, such as formatting requirements, tone preferences, or content constraints. Well-structured instructions improve response quality and consistency. Users can enhance instruction-based prompts by specifying output length, defining required elements, and avoiding ambiguity.',
      ],
    },
    {
      title: '6. Contextual Prompting',
      content: [
        'Contextual prompting provides additional background information within the prompt to improve the AI’s understanding and relevance of responses. This can include defining key terms, setting a narrative context, or embedding previous exchanges in multi-turn conversations. Context-rich prompts improve coherence and allow AI to generate more informed responses based on user intent. A good practice is to frame context concisely while ensuring all necessary information is included.',
      ],
    },
  ],
};

export default function BasicTechniquesPage() {
  return <LessonContent lesson={lessonData} />;
}
