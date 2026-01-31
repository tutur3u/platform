import Link from 'next/link';

export function ContactSection() {
  return (
    <section id="contact" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="glass-card relative overflow-hidden rounded-3xl p-8 text-center md:p-12">
          {/* Background decoration */}
          <div className="gradient-bg absolute inset-0 opacity-5" />
          <div className="blob -top-40 -right-40 h-64 w-64" />
          <div className="blob -bottom-24 -left-24 h-48 w-48" />

          <div className="relative z-10">
            <h2 className="mb-4 font-black text-3xl md:text-4xl">
              READY TO <span className="gradient-text">INNOVATE?</span>
            </h2>
            <p className="mx-auto mb-8 max-w-xl font-bold text-foreground text-lg">
              Join the NEO League Season 2 and showcase your IoT innovation
              skills. Registration is now open!
            </p>

            <Link
              href="#register"
              className="btn-primary mb-12 inline-flex animate-pulse-glow px-8 py-4 font-black text-lg uppercase"
            >
              Register Your Team
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>

            <div className="mt-8 border-primary/20 border-t pt-8">
              <h3 className="mb-6 font-black">CONTACT US</h3>
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <p className="mb-1 text-foreground text-md">Phone</p>
                  <p className="font-bold text-sm">0765386296 (Ms. Tam)</p>
                  <p className="font-bold text-sm">0918498056 (Mr. Tai)</p>
                </div>
                <div>
                  <p className="mb-1 text-foreground text-md">Email</p>
                  <Link
                    href="mailto:neoculturetechclub.sgs@rmit.edu.vn"
                    className="font-bold text-primary text-sm hover:underline"
                  >
                    neoculturetechclub.sgs@rmit.edu.vn
                  </Link>
                </div>
                <div>
                  <p className="mb-1 text-foreground text-md">Follow Us</p>
                  <div className="flex flex-col justify-center">
                    <Link
                      href="https://rmitnct.club"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary transition-colors hover:text-primary-foreground"
                    >
                      🌐 rmitnct.club
                    </Link>
                    <Link
                      href="https://facebook.com/RMITNeoCultureTech"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary transition-colors hover:text-primary-foreground"
                    >
                      📘 Facebook
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
