export type ToolFieldType = 'text' | 'textarea' | 'select' | 'tags';

export interface ToolField {
  value?: string;
  type: ToolFieldType;
  label: string;
  placeholder?: string;
  options?: readonly string[];
  required?: boolean;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: readonly string[];
  fields: readonly ToolField[];
}

export const recommendedTools: Tool[] = (
  [
    {
      name: '5E Model Lesson Plan',
      description:
        'Generate a 5E model lesson plan for your science class. Engage, Explore, Explain, Elaborate, Evaluate.',
      category: 'teaching',
      tags: [
        'Lesson Planning',
        '5E Model',
        'Science Education',
        'Instructional Strategies',
      ],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Objective',
          placeholder:
            'e.g. Students will understand the process of photosynthesis.',
        },
      ],
    },
    {
      name: 'Science Labs',
      description:
        'Generate an engaging science lab based on topics and standards of your choice.',
      category: 'teaching',
      tags: [
        'Science Experiments',
        'Lab Activities',
        'Hands On Learning',
        'STEM',
      ],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Chemical Reactions',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Objective',
          placeholder: 'e.g. Understand the process of chemical reactions.',
        },
      ],
    },
    {
      name: 'Three Dimensional (3D) Science Assessments',
      description:
        'Write a three dimensional science assessment using NGSS standards.',
      category: 'teaching',
      tags: [
        'NGSS Standards',
        '3D Learning',
        'Science Assessments',
        'Performance Tasks',
      ],
      fields: [
        {
          type: 'text',
          label: 'Standard',
          placeholder: 'e.g. NGSS MS-PS1-2',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 6th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Assessment Type',
          placeholder: 'e.g. Performance Task',
        },
      ],
    },
    {
      name: 'Real World Connections',
      description:
        'Generate real world examples to increase student investment.',
      category: 'teaching',
      tags: [
        'Student Engagement',
        'Applied Learning',
        'Relevance',
        'Motivation',
      ],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Climate Change',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 9th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Objective',
          placeholder: 'e.g. Understand the impact of climate change.',
        },
      ],
    },
    {
      name: 'Standards Unpacker',
      description:
        'Unpack any standard into component parts to understand what students need to learn.',
      category: 'teaching',
      tags: [
        'Curriculum Standards',
        'Learning Objectives',
        'Educational Planning',
      ],
      fields: [
        {
          type: 'text',
          label: 'Standard',
          placeholder: 'e.g. CCSS.ELA-LITERACY.RL.5.1',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Concept Map',
      description:
        'Create a concept map to show relationships between concepts and ideas.',
      category: 'teaching',
      tags: [
        'Visual Learning',
        'Idea Organization',
        'Mind Mapping',
        'Critical Thinking',
      ],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Ecosystems',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 6th Grade',
          required: true,
        },
      ],
    },
  ] as const
).map((tool) => ({
  ...tool,
  id: tool.name
    .replace(/\s+/g, '-')
    .replace(/[/!]/g, '')
    .replace(/--+/g, '-')
    .toLowerCase(),
})) satisfies Tool[];

export const tools: Tool[] = (
  [
    {
      name: 'Text Rewriter',
      description:
        "Take any text and rewrite it with custom criteria however you'd like!",
      category: 'teaching',
      tags: [
        'Writing Tools',
        'Paraphrasing',
        'Content Editing',
        'Language Arts',
      ],
      fields: [
        {
          type: 'textarea',
          label: 'Text to Rewrite',
          placeholder: 'Enter the text you want to rewrite',
          required: true,
        },
        {
          type: 'text',
          label: 'Style',
          placeholder: 'e.g. Professional, Casual, Academic',
        },
      ],
    },
    {
      name: 'Lesson Plan',
      description:
        'Generate a lesson plan for a topic or objective you’re teaching.',
      category: 'teaching',
      tags: ['Lesson Planning', 'Curriculum Design', 'Teaching Resources'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. World War II',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 8th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Duration',
          placeholder: 'e.g. 45 minutes',
        },
        {
          type: 'text',
          label: 'Learning Objectives',
          placeholder: 'What students will learn',
        },
      ],
    },
    {
      name: 'Multiple Choice Quiz / Assessment',
      description:
        'Create a multiple choice assessment, quiz, or test based on any topic, standard(s), or criteria!',
      category: 'teaching',
      tags: ['Assessment Creation', 'Quizzes', 'Testing', 'Evaluation Methods'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Fractions',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Number of Questions',
          placeholder: 'e.g. 10',
          required: true,
        },
      ],
    },
    {
      name: 'Worksheet Generator',
      description: 'Generate a worksheet based on any topic or text.',
      category: 'teaching',
      tags: [
        'Printable Worksheets',
        'Practice Exercises',
        'Educational Materials',
      ],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Addition and Subtraction',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 3rd Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Instructions',
          placeholder: 'Instructions for students',
        },
      ],
    },
    {
      name: 'Report Card Comments',
      description:
        "Generate report card comments with a student's strengths and areas for growth.",
      category: 'teaching',
      tags: ['Feedback', 'Student Evaluation', 'Parent Communication'],
      fields: [
        {
          type: 'text',
          label: 'Student Name',
          placeholder: 'e.g. John Doe',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Strengths',
          placeholder: 'e.g. John has shown great improvement in math.',
        },
        {
          type: 'textarea',
          label: 'Areas for Growth',
          placeholder: 'e.g. John needs to work on his reading comprehension.',
        },
      ],
    },
    {
      name: 'Text Leveler',
      description:
        "Take any text and adapt it for any grade level to fit a student's reading level / skills.",
      category: 'teaching',
      tags: [
        'Reading Level Adjustment',
        'Differentiated Instruction',
        'Accessibility',
      ],
      fields: [
        {
          type: 'textarea',
          label: 'Text to Level',
          placeholder: 'Enter the text you want to level',
          required: true,
        },
        {
          type: 'text',
          label: 'Target Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Academic Content',
      description:
        'Generate original academic content customized to the criteria of your choice.',
      category: 'teaching',
      tags: ['Content Creation', 'Custom Lessons', 'Educational Resources'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Criteria',
          placeholder: 'e.g. Include diagrams and examples.',
        },
      ],
    },
    {
      name: 'Informational Texts',
      description:
        'Generate original informational texts for your class, customized to the topic of your choice.',
      category: 'teaching',
      tags: ['Text Generation', 'Reading Materials', 'Custom Content'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. The Water Cycle',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Professional Email',
      description:
        'Generate a professional e-mail communication to colleagues and other professionals.',
      category: 'teaching',
      tags: [
        'Professional Communication',
        'Email Writing',
        'Business Correspondence',
      ],
      fields: [
        {
          type: 'text',
          label: 'Recipient',
          placeholder: 'e.g. Principal',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Message',
          placeholder: 'Enter the message you want to send',
          required: true,
        },
      ],
    },
    {
      name: 'YouTube Video Questions',
      description: 'Generate guiding questions aligned to a YouTube video.',
      category: 'teaching',
      tags: ['Media Integration', 'Comprehension Questions', 'Video Resources'],
      fields: [
        {
          type: 'text',
          label: 'YouTube Video URL',
          placeholder: 'Enter the URL of the YouTube video',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 6th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Rubric Generator',
      description:
        'Have AI write a rubric for an assignment you are creating for your class in a table format.',
      category: 'teaching',
      tags: ['Rubric', 'Generator', 'Assignment', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Assignment Title',
          placeholder: 'e.g. Science Project',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 8th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Criteria',
          placeholder: 'e.g. Creativity, Accuracy, Presentation',
        },
      ],
    },
    {
      name: 'Text Summarizer',
      description:
        'Take any text and summarize it in whatever length you choose.',
      category: 'teaching',
      tags: ['Text', 'Summarizer', 'Length', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Text to Summarize',
          placeholder: 'Enter the text you want to summarize',
          required: true,
        },
        {
          type: 'text',
          label: 'Summary Length',
          placeholder: 'e.g. 100 words',
        },
      ],
    },
    {
      name: 'Text Proofreader',
      description:
        'Take any text and have it proofread, correcting grammar, spelling, punctuation and adding clarity.',
      category: 'teaching',
      tags: ['Text', 'Proofreader', 'Grammar', 'Spelling', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Text to Proofread',
          placeholder: 'Enter the text you want to proofread',
          required: true,
        },
      ],
    },
    {
      name: 'Text Dependent Questions',
      description:
        'Generate text-dependent questions for students based on any text that you input.',
      category: 'teaching',
      tags: ['Text', 'Dependent', 'Questions', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Text',
          placeholder: 'Enter the text for generating questions',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Text Translator',
      description:
        'Take any text and translate it into any language instantly.',
      category: 'teaching',
      tags: ['Text', 'Translator', 'Language', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Text to Translate',
          placeholder: 'Enter text to translate',
          required: true,
        },
        {
          type: 'text',
          label: 'Target Language',
          placeholder: 'e.g. Spanish, French, Vietnamese',
          required: true,
        },
      ],
    },
    {
      name: 'IEP Generator',
      description:
        "Generate a draft of an individualized education program (IEP) customized to a students' needs.",
      category: 'teaching',
      tags: ['IEP', 'Generator', 'Customized', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Student Name',
          placeholder: 'e.g. Jane Doe',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 3rd Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Needs',
          placeholder: 'e.g. Reading comprehension support',
        },
      ],
    },
    {
      name: 'Unit Plan Generator',
      description:
        'Generate a draft of a unit plan based on topic, standards and objectives, and length of unit.',
      category: 'teaching',
      tags: ['Unit Plan', 'Generator', 'Standards', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Ancient Civilizations',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 6th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Length of Unit',
          placeholder: 'e.g. 4 weeks',
        },
        {
          type: 'textarea',
          label: 'Standards and Objectives',
          placeholder:
            'e.g. Understand the development of early civilizations.',
        },
      ],
    },
    {
      name: 'Writing Feedback',
      description:
        'Based on a custom criteria, have AI give areas of strength & areas for growth on student work.',
      category: 'teaching',
      tags: ['Writing', 'Feedback', 'Strength', 'Growth', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Student Work',
          placeholder: 'Enter the student work for feedback',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Criteria',
          placeholder: 'e.g. Grammar, Structure, Creativity',
        },
      ],
    },
    {
      name: 'E-mail Responder',
      description:
        'Generate a customized professional e-mail communication in response to an email that you received.',
      category: 'teaching',
      tags: ['Email', 'Responder', 'Customized', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Received Email',
          placeholder: 'Enter the email you received',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Response',
          placeholder: 'Enter your response',
          required: true,
        },
      ],
    },
    {
      name: 'E-mail Family',
      description:
        'Generate a professional e-mail communication to families and translate into multiple languages.',
      category: 'teaching',
      tags: ['Email', 'Family', 'Communication', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Message',
          placeholder: 'Enter the message you want to send',
          required: true,
        },
        {
          type: 'text',
          label: 'Target Language',
          placeholder: 'e.g. Spanish, French, Vietnamese',
          required: true,
        },
      ],
    },
    {
      name: 'Song Generator',
      description:
        'Write a custom song about any topic to the tune of the song of your choice!',
      category: 'teaching',
      tags: ['Song', 'Generator', 'Custom', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Tune',
          placeholder: 'e.g. Twinkle Twinkle Little Star',
          required: true,
        },
      ],
    },
    {
      name: 'Standards Unpacker',
      description:
        'Unpack any standard into component parts to understand what students need to learn.',
      category: 'teaching',
      tags: ['Standards', 'Unpacker', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Standard',
          placeholder: 'e.g. CCSS.ELA-LITERACY.RL.5.1',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'DOK Questions',
      description:
        'Generate questions based on topic or standard for each of the 4 Depth of Knowledge (DOK) levels.',
      category: 'teaching',
      tags: ['DOK', 'Questions', 'Knowledge', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Fractions',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Standard',
          placeholder: 'e.g. CCSS.MATH.CONTENT.5.NF.B.3',
        },
      ],
    },
    {
      name: 'YouTube Video Summarizer',
      description:
        'Get a summary of a YouTube video in whatever length you choose.',
      category: 'teaching',
      tags: ['YouTube', 'Video', 'Summarizer', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'YouTube Video URL',
          placeholder: 'Enter the URL of the YouTube video',
          required: true,
        },
        {
          type: 'text',
          label: 'Summary Length',
          placeholder: 'e.g. 100 words',
        },
      ],
    },
    {
      name: 'Project Based Learning (PBL)',
      description:
        'Based on the principles of Project Based Learning (PBL), create a full project plan.',
      category: 'teaching',
      tags: ['PBL', 'Project', 'Learning', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Renewable Energy',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 8th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Objectives',
          placeholder: 'e.g. Understand the benefits of renewable energy.',
        },
      ],
    },
    {
      name: '5E Model Lesson Plan',
      description:
        'Generate a 5E model lesson plan for your science class. Engage, Explore, Explain, Elaborate, Evaluate.',
      category: 'teaching',
      tags: ['Lesson Plan', '5E Model', 'Science', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Objective',
          placeholder:
            'e.g. Students will understand the process of photosynthesis.',
        },
      ],
    },
    {
      name: 'Teacher Jokes',
      description:
        'Generate teacher jokes for your class to be the coolest teacher out there!',
      category: 'teaching',
      tags: ['Teacher', 'Jokes', 'Class', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Math',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Math Story Word Problems',
      description:
        'Write a custom math word / story problem based on the concept you’re teaching and a story topic.',
      category: 'teaching',
      tags: ['Math', 'Story', 'Problems', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Concept',
          placeholder: 'e.g. Fractions',
          required: true,
        },
        {
          type: 'text',
          label: 'Story Topic',
          placeholder: 'e.g. Baking a cake',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Vocabulary List Generator',
      description:
        'Generate a list of vocabulary words based on a subject, topic, or text that are important for students to learn.',
      category: 'teaching',
      tags: ['Vocabulary', 'List', 'Generator', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Subject',
          placeholder: 'e.g. Science',
          required: true,
        },
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Group Work Generator',
      description:
        'Generate group work activity for students based on a a topic, standard, or objective.',
      category: 'teaching',
      tags: ['Group', 'Work', 'Activity', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Ecosystems',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 6th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Objective',
          placeholder: 'e.g. Understand the relationships in ecosystems.',
        },
      ],
    },
    {
      name: 'Choice Board (UDL)',
      description:
        'Create a choice board for a student assignment based on the principles of UDL.',
      category: 'teaching',
      tags: ['Choice', 'Board', 'UDL', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Assignment Title',
          placeholder: 'e.g. Science Project',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 8th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Options',
          placeholder: 'e.g. Create a poster, Write an essay, Make a video',
        },
      ],
    },
    {
      name: 'Multiple Explanations',
      description:
        "Generate clear explanations of concepts that you're teaching in class to help student understanding.",
      category: 'teaching',
      tags: ['Explanations', 'Concepts', 'Understanding', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Concept',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Custom Chatbot',
      description:
        'Create a custom chatbot to interact with based on any criteria that you choose!',
      category: 'teaching',
      tags: ['Custom', 'Chatbot', 'Criteria', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Math Tutor',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Criteria',
          placeholder: 'e.g. Focus on fractions and decimals.',
        },
      ],
    },
    {
      name: 'Rewise for Students Ideas',
      description:
        'Get ideas on how to use Rewise tools in your student activities and assignments.',
      category: 'teaching',
      tags: ['Rewise', 'Students', 'Ideas', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Activity Type',
          placeholder: 'e.g. Group Work',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 6th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Team Builder / Ice Breaker',
      description:
        'Create a team builder / Ice Breaker for virtual or in-person meetings.',
      category: 'teaching',
      tags: ['Team', 'Builder', 'Ice Breaker', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Activity Type',
          placeholder: 'e.g. Two Truths and a Lie',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Jeopardy Review Game',
      description:
        'Create a jeopardy review game for a fun way to review content with students!',
      category: 'teaching',
      tags: ['Jeopardy', 'Review', 'Game', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. American History',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 8th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Social Stories',
      description:
        'Generate a social story about a particular event to help a student understand what to expect in that situation.',
      category: 'teaching',
      tags: ['Social', 'Story', 'Event', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Event',
          placeholder: 'e.g. Going to the dentist',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 2nd Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Teacher Observations',
      description:
        'Generate areas of strength and suggestions for next steps for a teacher based on a classroom observation.',
      category: 'teaching',
      tags: ['Teacher', 'Observations', 'Strength', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Teacher Name',
          placeholder: 'e.g. Mr. Smith',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Observation Notes',
          placeholder: 'e.g. Engaged students with interactive activities.',
        },
      ],
    },
    {
      name: 'Math Spiral Review',
      description:
        'Generate a spiral review problem set for any math standards or topics.',
      category: 'teaching',
      tags: ['Math', 'Spiral', 'Review', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Fractions',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Thank You Note',
      description:
        'Generate a customized thank you note to show your appreciation!',
      category: 'teaching',
      tags: ['Thank You', 'Note', 'Appreciation', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Recipient',
          placeholder: 'e.g. Principal',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Message',
          placeholder: 'Enter the message you want to send',
          required: true,
        },
      ],
    },
    {
      name: 'Data Table Analysis',
      description:
        'Generate a table with data of your choice for your class with associated questions.',
      category: 'teaching',
      tags: ['Data', 'Table', 'Analysis', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Data',
          placeholder: 'Enter the data for the table',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Real World Connections',
      description:
        'Generate real world examples to increase student investment.',
      category: 'teaching',
      tags: ['Real World', 'Examples', 'Student Investment', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Climate Change',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 9th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Objective',
          placeholder: 'e.g. Understand the impact of climate change.',
        },
      ],
    },
    {
      name: 'SEL Lesson Plan',
      description:
        'Generate a Social Emotional Learning (SEL) lesson plan for students in any grade level.',
      category: 'teaching',
      tags: ['SEL', 'Lesson Plan', 'Emotional', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Empathy',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Objective',
          placeholder: 'e.g. Understand the importance of empathy.',
        },
      ],
    },
    {
      name: 'Letter of Recommendation',
      description:
        'Generate a letter of recommendation to a university or institution for a student using specific content about them.',
      category: 'teaching',
      tags: ['Letter', 'Recommendation', 'University', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Student Name',
          placeholder: 'e.g. John Doe',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 12th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Content',
          placeholder: 'e.g. John has shown exceptional skills in science.',
        },
      ],
    },
    {
      name: 'Exemplar & Non-Exemplar',
      description:
        'Have AI write exemplar & non-exemplar responses to specific assignments to help "see" what is expected.',
      category: 'teaching',
      tags: ['Exemplar', 'Non-Exemplar', 'Assignments', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Assignment Title',
          placeholder: 'e.g. Science Project',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 8th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Criteria',
          placeholder: 'e.g. Creativity, Accuracy, Presentation',
        },
      ],
    },
    {
      name: 'Text Analysis Assignment',
      description:
        'Generate a text based analysis assignment that includes a writing prompt along with text dependent questions.',
      category: 'teaching',
      tags: ['Text', 'Analysis', 'Assignment', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Text',
          placeholder: 'Enter the text for analysis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Writing Prompt',
          placeholder: 'Enter the writing prompt',
        },
        {
          type: 'textarea',
          label: 'Text Dependent Questions',
          placeholder: 'Enter the text dependent questions',
        },
      ],
    },
    {
      name: 'Vocabulary Based Texts',
      description:
        'Generate original texts for your class that include a custom list of vocabulary to help practice words in context.',
      category: 'teaching',
      tags: ['Vocabulary', 'Texts', 'Custom', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. The Water Cycle',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Vocabulary List',
          placeholder: 'Enter the vocabulary words',
        },
      ],
    },
    {
      name: 'Syllabus Generator',
      description:
        'Generate a syllabus based on information provided about your class for the school year.',
      category: 'teaching',
      tags: ['Syllabus', 'Generator', 'Class', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Class Name',
          placeholder: 'e.g. Biology 101',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 10th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Course Description',
          placeholder: 'Enter the course description',
        },
        {
          type: 'textarea',
          label: 'Course Objectives',
          placeholder: 'Enter the course objectives',
        },
      ],
    },
    {
      name: 'Multi-Step Assignment',
      description:
        'Generate a full assignment based on any topic, including a warmup, academic content, vocabulary, and questions.',
      category: 'teaching',
      tags: ['Multi-Step', 'Assignment', 'Academic', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Warmup',
          placeholder: 'Enter the warmup activity',
        },
        {
          type: 'textarea',
          label: 'Academic Content',
          placeholder: 'Enter the academic content',
        },
        {
          type: 'textarea',
          label: 'Vocabulary',
          placeholder: 'Enter the vocabulary words',
        },
        {
          type: 'textarea',
          label: 'Questions',
          placeholder: 'Enter the questions',
        },
      ],
    },
    {
      name: 'Behavior Intervention Suggestions',
      description:
        'Generate a list of suggestions for behavior intervention based on the behaviors of a student that needs support.',
      category: 'teaching',
      tags: ['Behavior', 'Intervention', 'Suggestions', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Student Name',
          placeholder: 'e.g. John Doe',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Behaviors',
          placeholder: 'e.g. Disruptive in class',
        },
      ],
    },
    {
      name: 'Science Labs',
      description:
        'Generate an engaging science lab based on topics and standards of your choice.',
      category: 'teaching',
      tags: ['Science', 'Labs', 'Experiments', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Chemical Reactions',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Objective',
          placeholder: 'e.g. Understand the process of chemical reactions.',
        },
      ],
    },
    {
      name: 'Quote of the Day',
      description: 'Generate quote of the day suggestions based on any topic.',
      category: 'teaching',
      tags: ['Quote', 'Day', 'Suggestions', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Perseverance',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Make it Relevant!',
      description:
        'Generate several ideas that make what you’re teaching relevant to your class based on their interests and background.',
      category: 'teaching',
      tags: ['Relevant', 'Ideas', 'Interests', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Interests and Background',
          placeholder: 'e.g. Students are interested in gardening.',
        },
      ],
    },
    {
      name: 'Social Media Post',
      description:
        'Generate a strong social media post to share on popular platforms.',
      category: 'teaching',
      tags: ['Social Media', 'Post', 'Platforms', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Platform',
          placeholder: 'e.g. Twitter',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Message',
          placeholder: 'Enter the message you want to post',
          required: true,
        },
      ],
    },
    {
      name: 'Sentence Starters',
      description:
        'Provide sentence starters for any topic, assignment, standard, or objective.',
      category: 'teaching',
      tags: ['Sentence', 'Starters', 'Assignment', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Decodable Texts',
      description:
        'Generate a decodable text based on the Science of Reading to support early literacy.',
      category: 'teaching',
      tags: ['Decodable', 'Text', 'Reading', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. The Water Cycle',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 1st Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Assignment Scaffolder',
      description:
        'Take any assignment and empower students by breaking it down into manageable steps, fostering stronger understanding and enabling greater independence.',
      category: 'teaching',
      tags: ['Assignment', 'Scaffolder', 'Steps', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Assignment',
          placeholder: 'Enter the assignment to scaffold',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Conceptual Understanding',
      description:
        'Generate ideas about how to help your students build conceptual understanding.',
      category: 'teaching',
      tags: ['Conceptual', 'Understanding', 'Ideas', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Concept',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Clear Directions',
      description:
        'Make your directions more concise and sequential so they’re easier to understand for your students.',
      category: 'teaching',
      tags: ['Directions', 'Concise', 'Sequential', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Directions',
          placeholder: 'Enter the directions to improve',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Accommodation Suggestions',
      description:
        'Generate a list of accommodations for a student who needs support.',
      category: 'teaching',
      tags: ['Accommodation', 'Suggestions', 'Support', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Student Name',
          placeholder: 'e.g. John Doe',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Needs',
          placeholder: 'e.g. Reading comprehension support',
        },
      ],
    },
    {
      name: 'Tongue Twisters',
      description: 'Create challenging tongue twisters to say out loud.',
      category: 'teaching',
      tags: ['Tongue', 'Twisters', 'Challenging', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Animals',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 3rd Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Class Newsletter',
      description: 'Generate a newsletter to send to families weekly.',
      category: 'teaching',
      tags: ['Class', 'Newsletter', 'Families', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Class Name',
          placeholder: 'e.g. Biology 101',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 10th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Content',
          placeholder: 'Enter the content for the newsletter',
        },
      ],
    },
    {
      name: 'Common Misconceptions',
      description:
        'Generate the most common misconceptions and how to address them on any topic.',
      category: 'teaching',
      tags: ['Common', 'Misconceptions', 'Address', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'AI Resistant Assignments',
      description:
        'Receive suggestions on making assignments more challenging for AI chatbots.',
      category: 'teaching',
      tags: ['AI', 'Resistant', 'Assignments', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Assignment',
          placeholder: 'Enter the assignment to improve',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'BIP Generator',
      description:
        'Generate suggestions for a Behavior Intervention Plan (BIP).',
      category: 'teaching',
      tags: ['BIP', 'Generator', 'Behavior', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Student Name',
          placeholder: 'e.g. John Doe',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Behaviors',
          placeholder: 'e.g. Disruptive in class',
        },
      ],
    },
    {
      name: 'Text Scaffolder',
      description:
        'Take any text and scaffold it for readers who are behind grade level or need extra support.',
      category: 'teaching',
      tags: ['Text', 'Scaffolder', 'Support', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Text to Scaffold',
          placeholder: 'Enter the text to scaffold',
          required: true,
        },
        {
          type: 'text',
          label: 'Target Grade Level',
          placeholder: 'e.g. 5th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Three Dimensional (3D) Science Assessments',
      description:
        'Write a three dimensional science assessment using NGSS standards.',
      category: 'teaching',
      tags: ['Science', 'Assessment', 'NGSS', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Standard',
          placeholder: 'e.g. NGSS MS-PS1-2',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 6th Grade',
          required: true,
        },
        {
          type: 'text',
          label: 'Assessment Type',
          placeholder: 'e.g. Performance Task',
        },
      ],
    },
    {
      name: "Coach's Sports Practice",
      description:
        'Generate a plan for practice for any sport that you’re coaching!',
      category: 'teaching',
      tags: ['Coach', 'Sports', 'Practice', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Sport',
          placeholder: 'e.g. Basketball',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 9th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Practice Plan',
          placeholder: 'Enter the practice plan',
        },
      ],
    },
    {
      name: 'Restorative Reflection',
      description:
        'Create a student reflection assignment based on restorative practices for disciplinary incidents.',
      category: 'teaching',
      tags: ['Restorative', 'Reflection', 'Disciplinary', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Incident',
          placeholder: 'e.g. Disruptive behavior in class',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Reflection Questions',
          placeholder: 'Enter the reflection questions',
        },
      ],
    },
    {
      name: 'SAT ELA Practice Test',
      description:
        'Generate a practice SAT ELA test that has passages and associated questions.',
      category: 'teaching',
      tags: ['SAT', 'ELA', 'Practice', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 11th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Passages',
          placeholder: 'Enter the passages for the test',
        },
        {
          type: 'textarea',
          label: 'Questions',
          placeholder: 'Enter the questions for the test',
        },
      ],
    },
    {
      name: 'Gift Suggestion',
      description:
        'A gift suggestion recommendation tool for teachers shopping for all of their loved ones.',
      category: 'teaching',
      tags: ['Gift', 'Suggestion', 'Recommendation', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Recipient',
          placeholder: 'e.g. Friend',
          required: true,
        },
        {
          type: 'text',
          label: 'Occasion',
          placeholder: 'e.g. Birthday',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Preferences',
          placeholder: 'e.g. Likes books and gardening',
        },
      ],
    },
    {
      name: 'Tool Recommendations',
      description:
        'Get recommendations of Rewise tools to use based on your specific needs!',
      category: 'teaching',
      tags: ['Tool', 'Recommendations', 'Rewise', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Needs',
          placeholder: 'Enter your specific needs',
          required: true,
        },
      ],
    },
    {
      name: 'Advanced Learning Plan (ALP)',
      description:
        'Generate draft of an Advanced Learning Plan (ALP) for a student.',
      category: 'teaching',
      tags: ['ALP', 'Advanced', 'Learning', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Student Name',
          placeholder: 'e.g. John Doe',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Goals',
          placeholder: 'e.g. Improve reading comprehension',
        },
      ],
    },
    {
      name: '504 Plan Generator',
      description: 'Generate draft of a 504 plan to support a student.',
      category: 'teaching',
      tags: ['504', 'Plan', 'Generator', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Student Name',
          placeholder: 'e.g. John Doe',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Accommodations',
          placeholder: 'e.g. Extra time on tests',
        },
      ],
    },
    {
      name: 'Prompt Assistant',
      description:
        'Input your prompt to have it improved and get feedback on your prompting skills.',
      category: 'teaching',
      tags: ['Prompt', 'Assistant', 'Feedback', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Prompt',
          placeholder: 'Enter your prompt',
          required: true,
        },
      ],
    },
    {
      name: 'PD Planner',
      description:
        'Generate a professional development plan for school staff on any topic.',
      category: 'teaching',
      tags: ['PD', 'Planner', 'Development', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Classroom Management',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. All Grades',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Objectives',
          placeholder: 'e.g. Improve classroom management skills',
        },
      ],
    },
    {
      name: 'Lesson Hook',
      description:
        'Get suggestions for a "hook" to engage students in your lesson based on the topic or standard.',
      category: 'teaching',
      tags: ['Lesson', 'Hook', 'Engage', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Photosynthesis',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'SAT Math Practice',
      description:
        'Generate a practice SAT Math exam to help students prepare.',
      category: 'teaching',
      tags: ['SAT', 'Math', 'Practice', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 11th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Questions',
          placeholder: 'Enter the questions for the exam',
        },
      ],
    },
    {
      name: 'Classroom Management',
      description:
        "Describe the challenge you're having with classroom management and get suggested solutions.",
      category: 'teaching',
      tags: ['Classroom', 'Management', 'Solutions', 'Teaching'],
      fields: [
        {
          type: 'textarea',
          label: 'Challenge',
          placeholder: 'Describe the challenge you are facing',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Survey Creator',
      description:
        'Create a survey to collect information or solicit feedback.',
      category: 'teaching',
      tags: ['Survey', 'Creator', 'Feedback', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Survey Title',
          placeholder: 'e.g. Student Feedback Survey',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 7th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Questions',
          placeholder: 'Enter the questions for the survey',
        },
      ],
    },
    {
      name: 'Chat with Docs',
      description:
        'Upload a document and have an AI powered chat based on the resource uploaded!',
      category: 'teaching',
      tags: ['Chat', 'Docs', 'Resource', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Document Title',
          placeholder: 'e.g. Science Notes',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Document Content',
          placeholder: 'Enter the content of the document',
          required: true,
        },
      ],
    },
    {
      name: 'SAT ELA Custom Practice',
      description: 'Generate practice SAT question based on a specific domain.',
      category: 'teaching',
      tags: ['SAT', 'ELA', 'Custom', 'Teaching'],
      fields: [
        {
          type: 'text',
          label: 'Domain',
          placeholder: 'e.g. Reading Comprehension',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 11th Grade',
          required: true,
        },
      ],
    },
    {
      name: 'Support Goals Creator',
      description:
        'Create a SMART goals tracker for students aligned to their needs. (Tier 2/3, MTSS, IEPs, etc.)',
      category: 'teaching',
      tags: [
        'Goal Setting',
        'Student Support',
        'Progress Monitoring',
        'Special Education',
      ],
      fields: [
        {
          type: 'text',
          label: 'Student Name',
          placeholder: 'e.g. John Doe',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 4th Grade',
          required: true,
        },
        {
          type: 'textarea',
          label: 'Goals',
          placeholder: 'e.g. Improve reading comprehension',
        },
      ],
    },
    {
      name: 'Concept Map',
      description:
        'Create a concept map to show relationships between concepts and ideas.',
      category: 'teaching',
      tags: [
        'Visual Learning',
        'Idea Organization',
        'Mind Mapping',
        'Critical Thinking',
      ],
      fields: [
        {
          type: 'text',
          label: 'Topic',
          placeholder: 'e.g. Ecosystems',
          required: true,
        },
        {
          type: 'text',
          label: 'Grade Level',
          placeholder: 'e.g. 6th Grade',
          required: true,
        },
      ],
    },
  ] as const
).map((tool) => ({
  ...tool,
  id: tool.name
    .replace(/\s+/g, '-')
    .replace(/[/!]/g, '')
    .replace(/--+/g, '-')
    .toLowerCase(),
})) satisfies Tool[];
