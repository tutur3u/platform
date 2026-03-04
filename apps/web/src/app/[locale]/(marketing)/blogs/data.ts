import type { JSONContent } from '@ncthub/ui/tiptap';

export interface Blog {
  id: string;
  title: string;
  excerpt: string;
  content: JSONContent;
  author: string;
  date: string;
  category:
    | 'Announcement'
    | 'Event'
    | 'Tutorial'
    | 'Technology'
    | 'Project Showcase'
    | 'Interview'
    | 'Community'
    | 'Career'
    | 'Opinion'
    | 'Resources';
  imageUrl?: string;
  readTime: string;
}

export const blogsData: Blog[] = [
  {
    id: 'welcome-to-nct',
    title: 'Welcome to NEO Culture Tech',
    excerpt:
      'Discover the vision behind NCT and how we are building a community of tech enthusiasts at RMIT.',
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Welcome to NEO Culture Tech' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Welcome to NEO Culture Tech (NCT), where innovation meets community. We are more than just a tech club; we are a vibrant ecosystem of passionate individuals who believe in the power of technology to transform lives.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Our Mission' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: "At NCT, we strive to create an environment where students can learn, experiment, and grow together. Whether you're a beginner taking your first steps into programming or an experienced developer looking to collaborate on exciting projects, you'll find your place here.",
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'What We Offer' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      marks: [{ type: 'bold' }],
                      text: 'Hands-on Projects',
                    },
                    {
                      type: 'text',
                      text: ': Work on real-world applications and build your portfolio',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      marks: [{ type: 'bold' }],
                      text: 'Workshops & Events',
                    },
                    {
                      type: 'text',
                      text: ': Learn from industry professionals and fellow students',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      marks: [{ type: 'bold' }],
                      text: 'Community Support',
                    },
                    {
                      type: 'text',
                      text: ': Connect with like-minded individuals who share your passion',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      marks: [{ type: 'bold' }],
                      text: 'Innovation Labs',
                    },
                    {
                      type: 'text',
                      text: ': Access to resources and mentorship for your ideas',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Join Us' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Ready to be part of something amazing? Join NCT today and start your journey in tech innovation!',
            },
          ],
        },
      ],
    },
    author: 'NCT Team',
    date: '2024-10-01',
    category: 'Announcement',
    imageUrl: '/media/marketing/landing-page.jpg',
    readTime: '5 min',
  },
  {
    id: 'hackathon-2024-recap',
    title: 'NCT Hackathon 2024: A Huge Success!',
    excerpt:
      'Relive the excitement of our annual hackathon with highlights, winner projects, and memorable moments.',
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [
            { type: 'text', text: 'NCT Hackathon 2024: A Huge Success!' },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: "Our annual hackathon was bigger and better than ever! With over 100 participants, 25 teams, and 48 hours of non-stop coding, creativity, and collaboration, this year's event exceeded all expectations.",
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Event Highlights' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'The energy at the hackathon was incredible. Teams worked tirelessly to bring their innovative ideas to life, tackling challenges ranging from AI-powered solutions to sustainable tech initiatives.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Winning Projects' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '1st Place: SmartCampus' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'A mobile app that helps students navigate the RMIT campus with AR-guided directions and real-time classroom availability.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '2nd Place: EcoTrack' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'An environmental impact tracking platform that gamifies sustainable living on campus.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '3rd Place: StudyBuddy AI' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'An AI-powered study companion that creates personalized learning plans based on individual needs.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Thank You' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: "A huge thank you to all participants, mentors, sponsors, and organizers who made this event possible. We can't wait to see you at next year's hackathon!",
            },
          ],
        },
      ],
    },
    author: 'Events Team',
    date: '2024-09-15',
    category: 'Event',
    imageUrl: '/media/marketing/landing-page.jpg',
    readTime: '8 min',
  },
  {
    id: 'getting-started-with-nextjs',
    title: 'Getting Started with Next.js: A Beginner Guide',
    excerpt:
      'Learn the fundamentals of Next.js and start building modern web applications with this comprehensive guide.',
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [
            {
              type: 'text',
              text: "Getting Started with Next.js: A Beginner's Guide",
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: "Next.js has become one of the most popular React frameworks for building modern web applications. In this guide, we'll walk you through the basics and get you started on your Next.js journey.",
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'What is Next.js?' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Next.js is a React framework that provides a powerful set of features including:',
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Server-side rendering (SSR)' },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Static site generation (SSG)' },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'API routes' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'File-based routing' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Automatic code splitting' }],
                },
              ],
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Setting Up Your First Project' }],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'bash' },
          content: [
            {
              type: 'text',
              text: 'npx create-next-app@latest my-app\ncd my-app\nnpm run dev',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Key Concepts' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '1. File-based Routing' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Next.js uses the file system to define routes. Simply create a file in the ',
            },
            {
              type: 'text',
              marks: [{ type: 'code' }],
              text: 'pages',
            },
            { type: 'text', text: ' directory, and it becomes a route.' },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '2. Server Components' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'With Next.js 13+, you can use Server Components by default, improving performance and reducing bundle size.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '3. Data Fetching' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Next.js provides multiple ways to fetch data depending on your needs: ',
            },
            {
              type: 'text',
              marks: [{ type: 'code' }],
              text: 'getStaticProps',
            },
            { type: 'text', text: ', ' },
            {
              type: 'text',
              marks: [{ type: 'code' }],
              text: 'getServerSideProps',
            },
            { type: 'text', text: ', and more.' },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Conclusion' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Next.js makes building React applications easier and more efficient. Start exploring and building your own projects today!',
            },
          ],
        },
      ],
    },
    author: 'Tech Team',
    date: '2024-08-20',
    category: 'Tutorial',
    imageUrl: '/media/marketing/landing-page.jpg',
    readTime: '12 min',
  },
  {
    id: 'ai-revolution-2024',
    title: 'The AI Revolution: Trends to Watch in 2024',
    excerpt:
      'Explore the latest AI trends shaping the tech industry and how they impact our daily lives.',
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [
            {
              type: 'text',
              text: 'The AI Revolution: Trends to Watch in 2024',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Artificial Intelligence continues to evolve at an unprecedented pace. As we move through 2024, several key trends are shaping the future of AI technology.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Major Trends' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '1. Generative AI Expansion' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'From ChatGPT to DALL-E, generative AI tools are becoming more sophisticated and accessible, transforming how we create content.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '2. AI in Healthcare' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'AI is revolutionizing medical diagnostics, drug discovery, and personalized treatment plans, making healthcare more efficient and accurate.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '3. Ethical AI Development' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: "There's a growing focus on developing AI responsibly, with emphasis on transparency, fairness, and accountability.",
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '4. Edge AI' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Processing AI computations on edge devices is becoming more common, reducing latency and improving privacy.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Impact on Students' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: "For students in tech, understanding AI is becoming essential. Whether you're interested in machine learning, data science, or software engineering, AI knowledge opens up countless opportunities.",
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Get Involved' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: "At NCT, we're exploring these trends through workshops, projects, and collaborations. Join us to be part of the AI revolution!",
            },
          ],
        },
      ],
    },
    author: 'Research Team',
    date: '2024-07-10',
    category: 'Technology',
    imageUrl: '/media/marketing/landing-page.jpg',
    readTime: '10 min',
  },
  {
    id: 'web-development-best-practices',
    title: '10 Web Development Best Practices Every Developer Should Know',
    excerpt:
      'Level up your web development skills with these essential best practices used by professional developers.',
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [
            {
              type: 'text',
              text: '10 Web Development Best Practices Every Developer Should Know',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: "Whether you're just starting out or have years of experience, following best practices ensures your code is maintainable, scalable, and efficient.",
            },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [
                    { type: 'text', text: 'Write Clean, Readable Code' },
                  ],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Use meaningful variable names, consistent formatting, and clear comments to make your code easy to understand.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Mobile-First Design' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Always design for mobile devices first, then scale up to larger screens.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Optimize Performance' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Minimize bundle sizes, lazy load images, and use caching strategies to improve load times.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Ensure Accessibility' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Make your websites usable for everyone by following WCAG guidelines and using semantic HTML.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Version Control' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Use Git for all your projects and commit frequently with descriptive messages.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Security First' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Protect against common vulnerabilities like XSS, CSRF, and SQL injection.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Responsive Images' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Use appropriate image formats and sizes for different devices and screen resolutions.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'SEO Optimization' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Implement proper meta tags, structured data, and semantic HTML for better search engine visibility.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Testing' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Write unit tests, integration tests, and E2E tests to ensure your code works as expected.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Continuous Learning' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'The web evolves rapidly. Stay updated with the latest technologies, frameworks, and best practices.',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Conclusion' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Following these best practices will make you a better developer and help you build better applications. Happy coding!',
            },
          ],
        },
      ],
    },
    author: 'Development Team',
    date: '2024-06-05',
    category: 'Tutorial',
    imageUrl: '/media/marketing/landing-page.jpg',
    readTime: '15 min',
  },
];
