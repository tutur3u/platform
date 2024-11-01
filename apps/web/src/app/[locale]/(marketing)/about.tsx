'use client';

import React, { useEffect, useRef } from 'react';

const BackgroundAndFont = () => {
  return (
    <style>
      {`
        .bg-gradient-custom {
          background: linear-gradient(to bottom, #000, #1A0A2E 34%, #37115F 65%, #52267E 82%);
        }

        .slider {
          position: relative;
          width: 350px;
          height: 80px;
          overflow: hidden;
          margin-left: 12px;
        }

        .slider__word {
          position: absolute;
          width: 100%;
          height: 100%;
          line-height: 80px;
          transform: translateY(100%);
          font-size: 60px;
          background: linear-gradient(45deg, #5FC6E5, #FFD700);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: slide 5s linear infinite;
        }
        .slider__word:nth-child(2) { animation-delay: 1.33s;}
        .slider__word:nth-child(3) { animation-delay: 2.67s;}

        @keyframes slide {
          0% { transform: translateY(100%) rotateX(130deg); opacity: 0;}
          15% { transform: translateY(0) rotateX(0); opacity: 1; }
          30% { transform: translateY(0) rotateX(0); opacity: 1; }
          45% { transform: translateY(-100%) rotateX(-90deg); opacity: 0;}
          100% { transform: translateY(-100%) rotateX(-90deg); opacity: 0;}
        }
         
        @keyframes slide-in-up {
          0% {transform: translateY(100%); opacity: 0;}
          100% {transform: translateY(0); opacity: 1;}
        }

        .animate-slide-in-up {
          animation: slide-in-up 2s ease forwards;
        }

        /* Image gallery styles */
        .image-container {
          transition: all 0.3s ease-in-out;
          transform: scale(0.8);
          opacity: 0.7;
        }

        .image-container.active {
          transform: scale(1.1);
          opacity: 1;
        }

        .image-container.adjacent {
          transform: scale(0.8);
        }

        /* Scrollbar styles */
        .custom-scrollbar {
          scroll-behavior: smooth;
          scroll-snap-type: x mandatory;
          -ms-overflow-style: none;  /* Hide scrollbar for IE and Edge */
          scrollbar-width: none;     /* Hide scrollbar for Firefox */
        }

        /* Hide scrollbar for Chrome, Safari and Opera */
        .custom-scrollbar::-webkit-scrollbar {
          display: none;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }

        @keyframes fadeInOut {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }

        .chevron {
          animation: fadeInOut 3s infinite;
        }

        .chevron-1 {
          animation-delay: 0s;
        }

        .chevron-2 {
          animation-delay: 1.5s;
        }
      `}
    </style>
  );
};

const AboutUs = () => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = () => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;

    const children = Array.from(scrollContainer.children) as HTMLElement[];

    children.forEach((child, index) => {
      const childRect = child.getBoundingClientRect();
      const childCenter = childRect.left + childRect.width / 2;
      const distance = Math.abs(containerCenter - childCenter);

      // Remove all classes first
      child.classList.remove('active', 'adjacent');

      // If the child is within 100px of the center
      if (distance < 100) {
        child.classList.add('active');

        // Add adjacent class to the previous and next images
        if (index > 0) {
          children[index - 1]?.classList.add('adjacent');
        }
        if (index < children.length - 1) {
          children[index + 1]?.classList.add('adjacent');
        }
      }
    });
  };

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -320, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 320, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const words = ['Individuals.', 'Progressions.', 'Experiences.'];
  const images = [
    'https://images.unsplash.com/photo-1604999565976-8913ad2ddb7c?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=320&h=160&q=80',
    'https://images.unsplash.com/photo-1540206351-d6465b3ac5c1?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=320&h=160&q=80',
    'https://images.unsplash.com/photo-1622890806166-111d7f6c7c97?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=320&h=160&q=80',
    'https://images.unsplash.com/photo-1590523277543-a94d2e4eb00b?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=320&h=160&q=80',
    'https://images.unsplash.com/photo-1575424909138-46b05e5919ec?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=320&h=160&q=80',
    'https://images.unsplash.com/photo-1559333086-b0a56225a93c?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=320&h=160&q=80',
  ];

  return (
    <>
      <div className="bg-gradient-custom relative flex h-screen w-full items-center justify-center">
        <BackgroundAndFont />
        <div className="animate-slide-in-up flex max-w-[1000px] flex-col items-center">
          <h2 className="mt-[-150px] text-[24px] font-extralight">
            Neo Culture Tech{' '}
          </h2>
          <h1 className="mt-4 text-[60px] font-extralight text-[#F7FFF7]">
            The Nexus of Tech Communities,
          </h1>
          <h1 className="-mr-[20px] flex p-2 text-[45px] font-extralight text-[#F7FFF7]">
            Where We Embrace
            <span className="slider -mt-2 text-[60px]">
              {words.map((word, index) => (
                <span key={index} className="slider__word">
                  {word}
                </span>
              ))}
            </span>
          </h1>

          <div className="mt-14 w-[780px] text-center text-[18px]">
            Dive into a community that fuels creativity, connection, and
            innovation. Immerse yourself with our events, workshops, and
            networking opportunities to spark your curiosity in the tech
            industry. Connect with industry experts and like-minded pals to
            pursue your career forward.
          </div>

          <div className="absolute my-80 flex flex-col">
            <span className="relative flex h-12 w-12 flex-col">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
                className="chevron chevron-1 h-6 w-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m19.5 8.25-7.5 7.5-7.5-7.5"
                />
              </svg>

              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
                className="chevron chevron-2 mt-[-4px] h-6 w-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m19.5 8.25-7.5 7.5-7.5-7.5"
                />
              </svg>
            </span>
          </div>
        </div>

        <div className="absolute left-1/2 top-[80%] mt-20 flex h-[800px] -translate-x-1/2 flex-col">
          <h2 className="text-center text-[32px] font-extralight">
            The Humans of <br />
            <span className="text-[36px]">Neo Culture Tech</span>
          </h2>
          <div className="ml-40 mt-10 w-[780px] text-center text-[18px] font-extralight">
            <p>
              Founded in 2019, we are RMIT University's leading club for SSET
              students interested in exploring the dynamic world of technology.
              Our objective is to bring forth human factors and create student
              connections through informative events, unforgettable activities,
              and practical projects.
            </p>

            <p className="py-4">
              We promote the growth of an inclusive environment where all
              members can flourish and meet like-minded people to further their
              professional interests, learn from one another, and expand their
              knowledge of the tech industry, cutting-edge technologies,
              programming, design, and other subjects. You belong here
              regardless of your background—TBS, SCD, or SSET.
            </p>

            <p>
              Join us to be a part of a vibrant community that creates
              everlasting experiences of student life!
            </p>
          </div>

          <div className="relative w-[1100px]">
            {' '}
            {/* Added relative container */}
            {/* Left Button */}
            <button
              onClick={scrollLeft}
              className="absolute left-[-65px] top-1/2 z-10 flex h-12 w-12 -translate-y-[10px] items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              ←
            </button>
            {/* Image Container */}
            <div
              ref={scrollRef}
              className="custom-scrollbar flex w-full snap-x snap-mandatory space-x-10 overflow-y-hidden overflow-x-scroll py-10" // Adjusted margin
              onScroll={handleScroll}
              style={{ scrollSnapAlign: 'center' }}
            >
              {images.map((src, index) => (
                <div
                  key={index}
                  className="image-container h-auto w-[320px] shrink-0 snap-center"
                  style={{ scrollSnapAlign: 'center' }}
                >
                  <img
                    className="w-80 rounded-lg shadow-xl"
                    src={src}
                    alt={`Gallery image ${index + 1}`}
                  />
                </div>
              ))}
            </div>
            {/* Right Button */}
            <button
              onClick={scrollRight}
              className="absolute right-[-65px] top-1/2 z-10 flex h-12 w-12 -translate-y-[10px] items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              →
            </button>
          </div>
        </div>
      </div>
      <div className="h-screen w-full bg-[#52267E]"></div>
    </>
  );
};

export default AboutUs;
