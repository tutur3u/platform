import { LessonContent } from '@/components/learn/lesson-content'

const lessonData = {
  title: "Best Practices in Prompt Engineering",
  sections: [
    {
      title: "1. Be Clear and Specific",
      content: "Always strive for clarity and specificity in your prompts. Avoid ambiguity and provide enough context to guide the AI towards the desired output.",
    },
    {
      title: "2. Use Consistent Formatting",
      content: "Maintain consistent formatting across your prompts. This helps the AI understand the structure of your requests and produce more reliable outputs.",
    },
    {
      title: "3. Leverage System Messages",
      content: "Utilize system messages to set the overall context and behavior of the AI. This can help in maintaining consistency across multiple interactions.",
    },
    {
      title: "4. Test and Iterate",
      content: "Regularly test your prompts and iterate based on the results. Continuous refinement is key to developing effective prompts.",
    },
    {
      title: "5. Consider Ethical Implications",
      content: "Always consider the ethical implications of your prompts. Avoid generating harmful, biased, or inappropriate content.",
    },
  ],
}

export default function BestPracticesPage() {
  return <LessonContent lesson={lessonData} />
}

