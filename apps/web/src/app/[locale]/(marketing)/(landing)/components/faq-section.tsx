'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import { MessageSquareHeart, Search, X } from '@tuturuuu/ui/icons';
import { useEffect, useRef, useState } from 'react';

gsap.registerPlugin(ScrollTrigger);

const faqs = [
  {
    question: "How does Tuturuuu's LLM understand my tasks and priorities?",
    answer:
      'Tuturuuu uses advanced large language models that comprehend natural language, context, and intent. When you add a task, the LLM analyzes the description to extract deadlines, importance, dependencies, and estimated effort. It also learns from your past behavior to better understand your unique priorities and preferences over time.',
    category: 'Technology',
  },
  {
    question: 'How is Tuturuuu different from Google Calendar?',
    answer:
      'Unlike Google Calendar, which is primarily a manual scheduling tool, Tuturuuu actively helps manage your tasks and time. It automatically schedules tasks based on priority and deadline, estimates workload, protects your focus time, and continuously optimizes your calendar as circumstances change. Google Calendar requires you to do the heavy lifting of deciding when to do what.',
    category: 'Features',
  },
  {
    question: 'Can Tuturuuu integrate with my existing calendar and task apps?',
    answer:
      'Yes! Tuturuuu seamlessly integrates with Google Calendar, Microsoft Outlook, Apple Calendar, as well as popular task management tools like Asana, Trello, and Todoist. Once connected, Tuturuuu will analyze your existing schedule and tasks to create an optimized plan.',
    category: 'Integrations',
  },
  {
    question: 'How does Tuturuuu handle team scheduling and availability?',
    answer:
      "Tuturuuu connects team members' calendars to understand everyone's availability, preferences, and workload. When scheduling team tasks or meetings, it finds optimal times that work for everyone while respecting individual focus times and existing commitments. It can even suggest splitting team members across different tasks based on skills and capacity.",
    category: 'Teams',
  },
  {
    question:
      'Will Tuturuuu respect my personal preferences for when I work best?',
    answer:
      'Absolutely! Tuturuuu learns your productivity patterns over time. It observes when you complete different types of tasks most efficiently and adapts to schedule similar work during your peak performance periods. You can also explicitly tell Tuturuuu about your preferences, such as preferring creative work in the morning or meetings in the afternoon.',
    category: 'Personalization',
  },
  {
    question: 'Is my task and calendar data secure with Tuturuuu?',
    answer:
      "We take data security extremely seriously. Tuturuuu uses bank-level encryption for all data, and we never share your information with third parties. Your data is only used to optimize your personal experience. You have complete control over what data is used and how it's processed.",
    category: 'Security',
  },
];

const categories = [
  'All',
  ...Array.from(new Set(faqs.map((faq) => faq.category))),
];

export function FaqSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const filteredFaqs = faqs.filter((faq) => {
    if (activeCategory !== 'All' && faq.category !== activeCategory)
      return false;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        faq.question.toLowerCase().includes(query) ||
        faq.answer.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchQuery('');
        if (searchInputRef.current) {
          searchInputRef.current.blur();
        }
      }

      // Open all FAQs with Alt+A
      if (e.altKey && e.key === 'a') {
        e.preventDefault();
        if (expandedItems.length === filteredFaqs.length) {
          setExpandedItems([]);
        } else {
          setExpandedItems(filteredFaqs.map((_, i) => `item-${i}`));
        }
      }

      // Focus search with Ctrl+F or Command+F
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandedItems, filteredFaqs.length]);

  useEffect(() => {
    if (!sectionRef.current) return;

    // Title animation
    gsap.from('.faq-title-wrapper', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.faq-title-wrapper',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    // Filter animation
    gsap.from('.faq-filters', {
      y: 30,
      opacity: 0,
      duration: 0.6,
      delay: 0.2,
      scrollTrigger: {
        trigger: '.faq-title-wrapper',
        start: 'top bottom-=100',
      },
    });

    // Search animation
    gsap.from('.faq-search', {
      y: 30,
      opacity: 0,
      duration: 0.6,
      delay: 0.3,
      scrollTrigger: {
        trigger: '.faq-title-wrapper',
        start: 'top bottom-=100',
      },
    });

    // FAQ items staggered animation
    gsap.from('.faq-item', {
      y: 30,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      scrollTrigger: {
        trigger: '.faq-accordion',
        start: 'top bottom-=50',
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, [activeCategory, searchQuery]);

  const toggleAccordionItem = (value: string) => {
    setExpandedItems((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const highlightText = (text: string) => {
    if (!searchQuery) return text;

    const query = searchQuery.toLowerCase();
    const index = text.toLowerCase().indexOf(query);

    if (index === -1) return text;

    return (
      <>
        {text.substring(0, index)}
        <span className="bg-yellow-200 text-black dark:bg-yellow-500 dark:text-black">
          {text.substring(index, index + query.length)}
        </span>
        {text.substring(index + query.length)}
      </>
    );
  };

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden py-24 md:py-40"
    >
      {/* Background decoration */}
      <div className="bg-dynamic-light-purple/10 absolute -top-40 left-0 h-96 w-96 rounded-full blur-3xl filter"></div>
      <div className="bg-dynamic-light-blue/10 absolute -bottom-40 right-0 h-96 w-96 rounded-full blur-3xl filter"></div>

      <div className="container mx-auto px-4">
        <div className="faq-title-wrapper mb-16 text-center">
          <h2 className="faq-title mb-6 text-4xl font-bold md:text-5xl">
            <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
              Frequently Asked Questions
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-3xl text-xl leading-relaxed">
            Find answers to common questions about Tuturuuu's AI scheduling
            capabilities.
          </p>
          <div className="text-muted-foreground mt-4 text-center text-sm">
            <kbd className="mx-1 rounded border border-gray-200 bg-gray-100 px-1 py-0.5 dark:border-gray-700 dark:bg-gray-800">
              Ctrl
            </kbd>
            <span className="mx-0.5">+</span>
            <kbd className="mx-1 rounded border border-gray-200 bg-gray-100 px-1 py-0.5 dark:border-gray-700 dark:bg-gray-800">
              F
            </kbd>
            <span className="ml-1">to search</span>
            <span className="mx-2">•</span>
            <kbd className="mx-1 rounded border border-gray-200 bg-gray-100 px-1 py-0.5 dark:border-gray-700 dark:bg-gray-800">
              Alt
            </kbd>
            <span className="mx-0.5">+</span>
            <kbd className="mx-1 rounded border border-gray-200 bg-gray-100 px-1 py-0.5 dark:border-gray-700 dark:bg-gray-800">
              A
            </kbd>
            <span className="ml-1">to expand/collapse all</span>
          </div>
        </div>

        <div className="mx-auto max-w-4xl">
          {/* Category filters */}
          <div className="faq-filters mb-8 flex flex-wrap justify-center gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={activeCategory === category ? 'default' : 'outline'}
                className={`rounded-full px-4 py-2 text-sm ${
                  activeCategory === category
                    ? 'bg-gradient-to-r from-purple-600 to-blue-500'
                    : ''
                }`}
                onClick={() => setActiveCategory(category)}
                aria-pressed={activeCategory === category}
              >
                {category}
                {category !== 'All' && (
                  <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                    {faqs.filter((faq) => faq.category === category).length}
                  </span>
                )}
              </Button>
            ))}
          </div>

          {/* Search with keyboard shortcuts */}
          <div className="faq-search mb-10 flex items-center justify-center">
            <div className="relative w-full max-w-lg">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search questions... (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-input ring-offset-background placeholder:text-muted-foreground dark:bg-foreground/5 w-full rounded-full border bg-white/90 py-3 pl-10 pr-10 text-sm transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                aria-label="Search questions"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="faq-accordion">
            {filteredFaqs.length > 0 ? (
              <div className="mb-4 flex items-center justify-between">
                <div className="text-muted-foreground text-sm">
                  {filteredFaqs.length}{' '}
                  {filteredFaqs.length === 1 ? 'result' : 'results'}{' '}
                  {searchQuery && (
                    <span>
                      for "<strong>{searchQuery}</strong>"
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (expandedItems.length > 0) {
                      setExpandedItems([]);
                    } else {
                      setExpandedItems(filteredFaqs.map((_, i) => `item-${i}`));
                    }
                  }}
                  aria-label={
                    expandedItems.length > 0 ? 'Collapse all' : 'Expand all'
                  }
                >
                  {expandedItems.length > 0 ? 'Collapse all' : 'Expand all'}
                </Button>
              </div>
            ) : null}

            {filteredFaqs.length > 0 ? (
              <Accordion
                type="multiple"
                value={expandedItems}
                onValueChange={setExpandedItems}
                className="space-y-6"
              >
                {filteredFaqs.map((faq, index) => (
                  <AccordionItem
                    key={index}
                    value={`item-${index}`}
                    className="faq-item border-input dark:bg-foreground/5 rounded-xl border bg-white/90 shadow-sm transition-all duration-300 hover:shadow-md"
                  >
                    <AccordionTrigger
                      className="group p-6 text-left text-lg font-medium md:text-xl"
                      onClick={() => toggleAccordionItem(`item-${index}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                          <span className="text-xs font-bold">{index + 1}</span>
                        </div>
                        <span className="mr-8 line-clamp-2">
                          {highlightText(faq.question)}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-balance px-6 pb-6 pt-0">
                      <div className="mb-4 flex items-center gap-2">
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                          {faq.category}
                        </span>
                      </div>
                      <p className="text-lg">{highlightText(faq.answer)}</p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="border-input dark:bg-foreground/5 flex flex-col items-center justify-center rounded-xl border bg-white/90 p-12 text-center">
                <Search className="text-muted-foreground mb-4 h-12 w-12" />
                <h3 className="mb-2 text-xl font-semibold">No results found</h3>
                <p className="text-muted-foreground mb-6">
                  We couldn't find any FAQs matching your search for "
                  {searchQuery}".
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCategory('All');
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>

          <div className="border-input dark:bg-foreground/5 mt-16 flex flex-col items-center justify-center rounded-xl border bg-white/90 p-8 text-center shadow-sm">
            <MessageSquareHeart className="mb-4 h-12 w-12 text-purple-500" />
            <h3 className="mb-2 text-2xl font-bold">Still have questions?</h3>
            <p className="text-muted-foreground mb-6 max-w-2xl">
              If you couldn't find the answer you were looking for, our support
              team is ready to help.
            </p>
            <Button className="bg-gradient-to-r from-purple-600 to-blue-500 hover:shadow-md">
              Contact Support
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
