export interface Blog {
  id: string;
  title: string;
  excerpt: string;
  content: string;
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
    content: `
# Welcome to NEO Culture Tech

Welcome to NEO Culture Tech (NCT), where innovation meets community. We are more than just a tech club; we are a vibrant ecosystem of passionate individuals who believe in the power of technology to transform lives.

## Our Mission
At NCT, we strive to create an environment where students can learn, experiment, and grow together. Whether you're a beginner taking your first steps into programming or an experienced developer looking to collaborate on exciting projects, you'll find your place here.

## What We Offer

- **Hands-on Projects**: Work on real-world applications and build your portfolio
- **Workshops & Events**: Learn from industry professionals and fellow students
- **Community Support**: Connect with like-minded individuals who share your passion
- **Innovation Labs**: Access to resources and mentorship for your ideas

## Join Us

Ready to be part of something amazing? Join NCT today and start your journey in tech innovation!
    `,
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
    content: `
# NCT Hackathon 2024: A Huge Success!

Our annual hackathon was bigger and better than ever! With over 100 participants, 25 teams, and 48 hours of non-stop coding, creativity, and collaboration, this year's event exceeded all expectations.

## Event Highlights

The energy at the hackathon was incredible. Teams worked tirelessly to bring their innovative ideas to life, tackling challenges ranging from AI-powered solutions to sustainable tech initiatives.

## Winning Projects

### 1st Place: SmartCampus
A mobile app that helps students navigate the RMIT campus with AR-guided directions and real-time classroom availability.

### 2nd Place: EcoTrack
An environmental impact tracking platform that gamifies sustainable living on campus.

### 3rd Place: StudyBuddy AI
An AI-powered study companion that creates personalized learning plans based on individual needs.

## Thank You

A huge thank you to all participants, mentors, sponsors, and organizers who made this event possible. We can't wait to see you at next year's hackathon!
    `,
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
    content: `
# Getting Started with Next.js: A Beginner's Guide

Next.js has become one of the most popular React frameworks for building modern web applications. In this guide, we'll walk you through the basics and get you started on your Next.js journey.

## What is Next.js?

Next.js is a React framework that provides a powerful set of features including:
- Server-side rendering (SSR)
- Static site generation (SSG)
- API routes
- File-based routing
- Automatic code splitting

## Setting Up Your First Project

\`\`\`bash
npx create-next-app@latest my-app
cd my-app
npm run dev
\`\`\`

## Key Concepts

### 1. File-based Routing
Next.js uses the file system to define routes. Simply create a file in the \`pages\` directory, and it becomes a route.

### 2. Server Components
With Next.js 13+, you can use Server Components by default, improving performance and reducing bundle size.

### 3. Data Fetching
Next.js provides multiple ways to fetch data depending on your needs: \`getStaticProps\`, \`getServerSideProps\`, and more.

## Conclusion

Next.js makes building React applications easier and more efficient. Start exploring and building your own projects today!
    `,
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
    content: `
# The AI Revolution: Trends to Watch in 2024

Artificial Intelligence continues to evolve at an unprecedented pace. As we move through 2024, several key trends are shaping the future of AI technology.

## Major Trends

### 1. Generative AI Expansion
From ChatGPT to DALL-E, generative AI tools are becoming more sophisticated and accessible, transforming how we create content.

### 2. AI in Healthcare
AI is revolutionizing medical diagnostics, drug discovery, and personalized treatment plans, making healthcare more efficient and accurate.

### 3. Ethical AI Development
There's a growing focus on developing AI responsibly, with emphasis on transparency, fairness, and accountability.

### 4. Edge AI
Processing AI computations on edge devices is becoming more common, reducing latency and improving privacy.

## Impact on Students

For students in tech, understanding AI is becoming essential. Whether you're interested in machine learning, data science, or software engineering, AI knowledge opens up countless opportunities.

## Get Involved

At NCT, we're exploring these trends through workshops, projects, and collaborations. Join us to be part of the AI revolution!
    `,
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
    content: `
# 10 Web Development Best Practices Every Developer Should Know

Whether you're just starting out or have years of experience, following best practices ensures your code is maintainable, scalable, and efficient.

## 1. Write Clean, Readable Code
Use meaningful variable names, consistent formatting, and clear comments to make your code easy to understand.

## 2. Mobile-First Design
Always design for mobile devices first, then scale up to larger screens.

## 3. Optimize Performance
Minimize bundle sizes, lazy load images, and use caching strategies to improve load times.

## 4. Ensure Accessibility
Make your websites usable for everyone by following WCAG guidelines and using semantic HTML.

## 5. Version Control
Use Git for all your projects and commit frequently with descriptive messages.

## 6. Security First
Protect against common vulnerabilities like XSS, CSRF, and SQL injection.

## 7. Responsive Images
Use appropriate image formats and sizes for different devices and screen resolutions.

## 8. SEO Optimization
Implement proper meta tags, structured data, and semantic HTML for better search engine visibility.

## 9. Testing
Write unit tests, integration tests, and E2E tests to ensure your code works as expected.

## 10. Continuous Learning
The web evolves rapidly. Stay updated with the latest technologies, frameworks, and best practices.

## Conclusion

Following these best practices will make you a better developer and help you build better applications. Happy coding!
    `,
    author: 'Development Team',
    date: '2024-06-05',
    category: 'Tutorial',
    imageUrl: '/media/marketing/landing-page.jpg',
    readTime: '15 min',
  },
];
