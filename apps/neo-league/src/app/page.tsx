export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 gradient-bg opacity-10 dark:opacity-20" />
        
        {/* Animated Blobs */}
        <div className="blob blob-primary w-96 h-96 -top-48 -left-48 animate-float" />
        <div className="blob blob-secondary w-80 h-80 top-1/2 -right-40 animate-float" style={{ animationDelay: '2s' }} />
        <div className="blob blob-primary w-64 h-64 bottom-20 left-1/4 animate-float" style={{ animationDelay: '4s' }} />
        
        <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
          <div className="animate-slide-up">
            <span className="inline-block px-4 py-2 mb-6 text-sm font-medium text-primary bg-secondary/30 dark:bg-secondary/20 rounded-full">
              RMIT NEO Culture Technology Club Presents
            </span>
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <span className="gradient-text">NEO LEAGUE</span>
            <br />
            <span className="text-foreground">SEASON 2</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-primary font-semibold mb-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            Innovation Humanity Challenge
          </p>
          
          <p className="max-w-2xl mx-auto text-lg text-text-muted mb-8 animate-slide-up" style={{ animationDelay: '0.3s' }}>
            Engineer integrated IoT solutions addressing UN Sustainable Development Goals.
            Combine physical prototyping with software, data connectivity, and smart technologies.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <a href="#register" className="btn-primary animate-pulse-glow">
              Register Now
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </a>
            <a href="#about" className="btn-secondary">
              Learn More
            </a>
          </div>
          
          <div className="glass inline-block px-8 py-4 rounded-2xl animate-slide-up" style={{ animationDelay: '0.5s' }}>
            <p className="text-lg font-medium">
              <span className="text-primary">📅</span> March 2 – May 29, 2026
              <span className="mx-4 text-text-muted">|</span>
              <span className="text-primary">📍</span> Ho Chi Minh City
            </p>
          </div>
        </div>
        
        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="section bg-secondary/10 dark:bg-secondary/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              About <span className="gradient-text">NEO League</span>
            </h2>
            <p className="text-text-muted max-w-2xl mx-auto">
              A student-led competition challenging Ho Chi Minh City undergraduates to engineer integrated IoT solutions.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="glass-card rounded-2xl p-8 card-hover">
              <div className="w-14 h-14 rounded-xl gradient-bg flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">The Challenge</h3>
              <p className="text-text-muted">
                Combine physical prototyping with software, data connectivity, and smart technologies to address UN Sustainable Development Goals (SDGs). Focus on real hardware solutions, not just ideation.
              </p>
            </div>
            
            <div className="glass-card rounded-2xl p-8 card-hover">
              <div className="w-14 h-14 rounded-xl gradient-bg flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">About The Organizers</h3>
              <p className="text-text-muted">
                RMIT NEO Culture Technology Club focuses on innovation in emerging technologies like machine learning and digital systems. With 80+ members and 30+ completed projects, we foster a community of tech enthusiasts.
              </p>
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { number: '80+', label: 'Club Members' },
              { number: '30+', label: 'Completed Projects' },
              { number: '20', label: 'Teams Advancing' },
              { number: '5', label: 'Finalists' },
            ].map((stat, index) => (
              <div key={index} className="text-center p-6 glass-card rounded-xl card-hover">
                <p className="text-3xl md:text-4xl font-bold gradient-text mb-2">{stat.number}</p>
                <p className="text-text-muted text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Competition Phases */}
      <section id="phases" className="section">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Competition <span className="gradient-text">Phases</span>
            </h2>
            <p className="text-text-muted max-w-2xl mx-auto">
              Three challenging rounds designed to test your innovation, technical skills, and presentation abilities.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                round: '01',
                title: 'Proposal',
                description: 'Submit a 10-slide digital IoT solution proposal targeting specific SDGs. Present your innovative idea and technical approach.',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
              },
              {
                round: '02',
                title: 'Prototype',
                description: 'Top 20 teams develop a functional physical prototype, technical documentation, and a 5-minute demo video.',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ),
              },
              {
                round: '03',
                title: 'Final Pitch',
                description: 'Top 5 finalists perform a live pitch and product demonstration at RMIT Saigon South Campus.',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                ),
              },
            ].map((phase, index) => (
              <div key={index} className="relative group">
                <div className="glass-card rounded-2xl p-8 h-full card-hover">
                  <div className="absolute -top-4 -right-4 w-16 h-16 gradient-bg rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                    {phase.round}
                  </div>
                  <div className="w-16 h-16 rounded-xl bg-secondary/30 dark:bg-secondary/20 flex items-center justify-center mb-6 text-primary">
                    {phase.icon}
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{phase.title}</h3>
                  <p className="text-text-muted">{phase.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Important Dates */}
      <section id="dates" className="section bg-secondary/10 dark:bg-secondary/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Important <span className="gradient-text">Dates</span>
            </h2>
            <p className="text-text-muted">
              Mark your calendar for these key milestones in 2026.
            </p>
          </div>
          
          <div className="space-y-6">
            {[
              { date: 'March 28', event: 'Opening Ceremony', type: 'Virtual', icon: '🎉' },
              { date: 'April 24', event: 'Top 20 Selection', type: 'Virtual', icon: '🏆' },
              { date: 'May 16', event: 'Top 5 Selection', type: 'Virtual', icon: '⭐' },
              { date: 'May 29', event: 'Finale - Exhibition', type: 'RMIT Auditorium', icon: '🎯' },
            ].map((item, index) => (
              <div key={index} className="glass-card rounded-2xl p-6 flex items-center gap-6 card-hover">
                <div className="w-16 h-16 gradient-bg rounded-xl flex items-center justify-center text-3xl shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-1">{item.event}</h3>
                  <p className="text-text-muted">{item.type}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold gradient-text">{item.date}</p>
                  <p className="text-text-muted text-sm">2026</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Eligibility & Rules */}
      <section id="rules" className="section">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Eligibility & <span className="gradient-text">Rules</span>
            </h2>
            <p className="text-text-muted max-w-2xl mx-auto">
              Make sure your team meets all requirements before registering.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-10 h-10 gradient-bg rounded-lg flex items-center justify-center text-white">✓</span>
                Eligibility
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">•</span>
                  <span>Undergraduates <strong>over 18 years old</strong> from any university in Ho Chi Minh City</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">•</span>
                  <span>Team of <strong>exactly 4 members</strong> with diverse backgrounds (Business, Software, Robotics, etc.)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">•</span>
                  <span>Projects must be <strong>functional physical prototypes</strong> — pure software solutions are excluded</span>
                </li>
              </ul>
            </div>
            
            <div className="glass-card rounded-2xl p-8">
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-10 h-10 gradient-bg rounded-lg flex items-center justify-center text-white">!</span>
                Rules
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <span><strong>Originality:</strong> Projects must be created specifically for NEO League Season 2</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <span><strong>Integrity:</strong> Zero tolerance for plagiarism or &quot;ghost-building&quot; (using external professional services)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <span><strong>Final Day:</strong> Finalists must surrender prototypes for morning inspection with 5-minute setup window</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Mentors & Judges */}
      <section id="mentors" className="section bg-secondary/10 dark:bg-secondary/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Mentors & <span className="gradient-text">Judges</span>
            </h2>
            <p className="text-text-muted max-w-2xl mx-auto">
              Learn from and be evaluated by distinguished faculty from RMIT School of Science, Engineering & Technology.
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { name: 'Dr. Byron Mason', field: 'Robotics & Mechatronics Engineering' },
              { name: 'Dr. Dinh-Son Vu', field: 'Robotics & Mechatronics Engineering' },
              { name: 'Dr. Hung Pham Viet', field: 'Electronic Computer Systems & Robotics' },
              { name: 'Dr. Ginel Dorleon', field: 'Artificial Intelligence' },
              { name: 'Dr. Minh Vu', field: 'Information Technology' },
              { name: 'Dr. Thanh Tran', field: 'Electronic & Computer Systems Engineering' },
              { name: 'Dr. Linh Tran', field: 'Software Engineering' },
              { name: 'Dr. Hoang Phan', field: 'Food Technology & Nutrition' },
            ].map((mentor, index) => (
              <div key={index} className="glass-card rounded-xl p-6 text-center card-hover">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full gradient-bg flex items-center justify-center text-white text-2xl font-bold">
                  {mentor.name.split(' ').pop()?.charAt(0)}
                </div>
                <h4 className="font-bold mb-1">{mentor.name}</h4>
                <p className="text-text-muted text-sm">{mentor.field}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="section">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 gradient-bg opacity-5" />
            <div className="blob blob-primary w-64 h-64 -top-32 -right-32" />
            <div className="blob blob-secondary w-48 h-48 -bottom-24 -left-24" />
            
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to <span className="gradient-text">Innovate?</span>
              </h2>
              <p className="text-text-muted max-w-xl mx-auto mb-8">
                Join the NEO League Season 2 and showcase your IoT innovation skills. Registration is now open!
              </p>
              
              <a href="#register" className="btn-primary text-lg px-8 py-4 animate-pulse-glow mb-12 inline-flex">
                Register Your Team
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </a>
              
              <div className="border-t border-primary/20 pt-8 mt-8">
                <h3 className="font-bold mb-6">Contact Us</h3>
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-text-muted text-sm mb-1">Phone</p>
                    <p className="font-medium">0765386296 (Ms. Tam)</p>
                    <p className="font-medium">0918498056 (Mr. Tai)</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-sm mb-1">Email</p>
                    <a href="mailto:neoculturetechclub.sgs@rmit.edu.vn" className="font-medium text-primary hover:underline">
                      neoculturetechclub.sgs@rmit.edu.vn
                    </a>
                  </div>
                  <div>
                    <p className="text-text-muted text-sm mb-1">Follow Us</p>
                    <div className="flex gap-4 justify-center md:justify-start">
                      <a href="https://rmitnct.club" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-dark transition-colors">
                        🌐 rmitnct.club
                      </a>
                      <a href="https://facebook.com/RMITNeoCultureTech" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-dark transition-colors">
                        📘 Facebook
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-primary/10">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-text-muted text-sm">
            © 2026 RMIT NEO Culture Technology Club. All rights reserved.
          </p>
          <p className="text-text-muted text-xs mt-2">
            Core Values: Culture • Revolutionary • Companionship • Diversity • Inclusion
          </p>
        </div>
      </footer>
    </div>
  );
}
