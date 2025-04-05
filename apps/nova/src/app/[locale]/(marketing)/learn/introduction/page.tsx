import { LessonContent } from '@/components/learn/lesson-content';

const lessonData = {
  title: 'Introduction to Large Language Models and Prompt Engineering',
  sections: [
    {
      title: 'Language Models & Large Language Models (LLMs) - Summary',
      content: [
        'A language model is a type of machine learning model designed to predict and generate plausible language. For example, autocomplete uses a language model to suggest the next word in a sentence. These models work by estimating the probability of a token (like a word) or a sequence of tokens occurring in a larger text. For instance, given the sentence "When I hear rain on my roof, I _______ in my kitchen," a language model might assign probabilities to possible completions like "cook soup" or "warm up a kettle." The ability to estimate what comes next in text is useful for many tasks, including text generation, translation, and question answering.',
        'LLMs are scaled-up language models with billions of parameters, trained on massive datasets. As models get larger, they can predict longer and more complex sequences — not just words but entire sentences, paragraphs, or documents.',
        'The Transformer architecture, introduced in 2017, is fundamental to modern LLMs. It uses a mechanism called attention to focus on the most relevant parts of the input, enabling efficient processing of long text sequences.',
        'Transformers consist of encoders, which convert input text into intermediate representations, and decoders, which convert those representations into output text. A core part of this is self-attention, which allows each token to assess how much other tokens in the input matter to it.',
      ],
    },
    {
      title: 'What is a Large Language Model (LLM)?',
      content: [
        'LLMs are scaled-up language models with billions of parameters, trained on massive datasets. As models get larger, they can predict longer and more complex sequences — not just words but entire sentences, paragraphs, or documents.',
        'A parameter is a weight learned by the model during training to help predict the next token. The term "large" can refer to both the number of parameters and the size of the training data.',
      ],
    },
    {
      title: 'Use Cases for LLMs',
      content: [
        'LLMs are widely used for:',
        '- Text generation',
        '- Translation',
        '- Summarization',
        '- Question answering',
        '- Text classification',
        'They can also perform tasks like writing code, solving math problems, and detecting sentiment or toxicity. These models excel at imitating human language patterns.',
      ],
    },
    {
      title: 'Challenges & Considerations',
      content: [
        'LLMs are resource-intensive, requiring months of training, massive datasets, and specialized hardware. They also pose ethical challenges, such as bias, cost, and engineering complexity.',
        '- **Bias**: They may reflect biases in the training data.',
        '- **Cost**: Training large models is expensive.',
        '- **Engineering complexity**: Handling models with billions of parameters requires advanced infrastructure.',
        'Techniques like offline inference and distillation help reduce costs. However, careful consideration is needed to manage ethical risks, including misuse and biased outputs.',
      ],
    },
    {
      title: 'What Is Prompt Engineering?',
      content: [
        'Prompt engineering involves crafting specific instructions to help generative AI produce the best output. Since AI models aim to mimic human responses, they need clear and detailed directions to generate high-quality, relevant results. Prompt engineers experiment with various input formats, words, and structures to improve how AI interacts with users and performs tasks.',
      ],
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
        '1. **Role**: Assigning a persona to the AI to guide its response style. Example: "You are a technical support specialist: A customer is asking about troubleshooting software issues."',
        '2. **Instruction/Task**: Defining the specific action the AI should take. Example: "Write a product description for a new smartphone highlighting key features and benefits."',
        '3. **Questions**: Framing a prompt as a question to guide the AI’s response. Example: "What are the risks of a high-sodium diet?"',
        '4. **Context**: Providing additional information to make the response more accurate and relevant. Example: "Given the patient’s medical history, suggest potential treatment options."',
        '5. **Example**: Offering examples to clarify the desired response type. Example: "Given the beginning and ending of a story, fill in the narrative with plot details and character development."',
      ],
    },
    {
      title: 'Prompting Best Practices',
      content: [
        '1. **Clearly Define the Focus**: Emphasize the key content or information you need.',
        '2. **Structure the Prompt**: Start with the role of the model, then provide context and instructions.',
        "3. **Provide Specific Examples**: Use varied examples to narrow the model's focus.",
        '4. **Use Constraints**: Limit the output to avoid inaccuracies.',
        '5. **Break Down Tasks**: Divide complex tasks into simpler steps.',
        '6. **Self-Assessment**: Instruct the model to evaluate its response (e.g., "Is this answer correct?").',
        '7. **Be Creative**: Experiment and adapt for better results as LLMs and prompting techniques evolve.',
      ],
    },
  ],
};

export default function IntroductionPage() {
  return <LessonContent lesson={lessonData} />;
}
