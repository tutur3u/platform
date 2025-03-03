import { LessonContent } from '@/components/learn/lesson-content';

const lessonData = {
  title: 'Best Practices in Prompt Engineering',
  sections: [
    {
      title: '1. Be Clear and Specific',
      content:
        'Always strive for clarity and specificity in your prompts. Avoid ambiguity and provide enough context to guide the AI towards the desired output.',
    },
    {
      title: '2. Use Consistent Formatting',
      content:
        'Maintain consistent formatting across your prompts. This helps the AI understand the structure of your requests and produce more reliable outputs.',
    },
    {
      title: '3. Leverage System Messages',
      content:
        'Utilize system messages to set the overall context and behavior of the AI. This can help in maintaining consistency across multiple interactions.',
    },
    {
      title: '4. Test and Iterate',
      content:
        'Regularly test your prompts and iterate based on the results. Continuous refinement is key to developing effective prompts.',
    },
    {
      title: '5. Consider Ethical Implications',
      content:
        'Always consider the ethical implications of your prompts. Avoid generating harmful, biased, or inappropriate content.',
    },
    {
      title: '6. Use Clear Instructions and Context',
      content:
        'Provide detailed instructions, relevant context, and expected outcomes in your prompt. This enables the AI to generate responses that are aligned with your objectives.',
    },
    {
      title: '7. Be Aware of the AI’s Limitations',
      content:
        'Understand the limitations of the AI model and design prompts that work within these constraints. This prevents unrealistic expectations and improves the quality of responses.',
    },
    {
      title: '8. Use Examples to Guide the AI',
      content:
        'Incorporate examples of what you expect from the AI in your prompts. Examples help clarify the intended structure and format, enhancing the model’s performance.',
    },
    {
      title: '9. Use Variables to Customize Prompts',
      content:
        'Incorporate dynamic variables in your prompts to make them more adaptable to different contexts. This allows for greater flexibility when generating responses based on different inputs.',
    },
    {
      title: '10. Set Clear Expectations for Tone and Style',
      content:
        'When crafting prompts, specify the tone and style of the response you’re looking for, such as formal, informal, or creative. This will help guide the AI in generating appropriate outputs.',
    },
    {
      title: '11. Avoid Ambiguity and Vague Language',
      content:
        'Avoid vague or overly broad terms in your prompts. Be specific and concise to ensure the AI understands the desired outcome, which improves the response quality.',
    },
    {
      title: '12. Be Mindful of Bias and Fairness',
      content:
        'Pay attention to potential biases in the prompts you create. Be mindful of fairness, inclusivity, and neutrality, especially when working with sensitive topics or diverse audiences.',
    },
  ],
};

export default function BestPracticesPage() {
  return <LessonContent lesson={lessonData} />;
}
