'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { BrainCircuit, Calendar, SmilePlus } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import FamiFeature from './FamiFeature';

const FeaturesSection = () => {
  return (
    <section id="features" className="relative w-full py-24">
      {/* Decorative elements */}
      <div className="absolute top-1/4 right-0 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10"></div>
      <div className="absolute bottom-1/4 left-0 h-64 w-64 rounded-full bg-purple-500/5 blur-3xl dark:bg-purple-500/10"></div>

      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-16 text-center">
          <Badge variant="outline" className="mb-4">
            Our Solution
          </Badge>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Famigo: AI-Powered Family Connection
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            A next-generation app designed to bridge emotional and communication
            gaps between family members, nurturing stronger bonds and joyful
            shared experiences in the digital age.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <FamiFeature
            icon={<BrainCircuit className="h-6 w-6" />}
            title="AI Mediator: Fami"
            description="Helps parents and children process concerns privately or, with consent, gently communicate them to each other, fostering empathy and respectful dialogue."
            color="purple"
          />

          <FamiFeature
            icon={<SmilePlus className="h-6 w-6" />}
            title="Daily Mood & Photo Sharing"
            description="A private family chat lets everyone share updates and photos with mood emojis, making it easier to understand and support one another's emotional state."
            color="pink"
          />

          <FamiFeature
            icon={<Calendar className="h-6 w-6" />}
            title="Smart Family Calendar"
            description="Syncs with personal calendars to find time for family dates, suggests activities, and uses past photos to spark memories when it's been too long since your last gathering."
            color="blue"
          />
        </div>

        {/* Interactive feature preview (placeholder) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-20 flex justify-center"
        >
          <div className="relative overflow-hidden rounded-xl border border-foreground/10 bg-foreground/5 p-6 backdrop-blur-sm dark:border-foreground/5 dark:bg-foreground/10">
            <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-primary/20 blur-3xl"></div>
            <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl"></div>

            <div className="relative">
              <div className="text-center">
                <p className="mb-2 text-sm font-medium text-muted-foreground">
                  Experience Famigo in Action
                </p>
                <div className="mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-blue-500/20">
                  <BrainCircuit className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold">Watch Demo Video</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  See how Famigo's AI mediator helps family members communicate
                  more effectively and build stronger connections.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default FeaturesSection;
