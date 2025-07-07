'use client';

import { Button } from '@ncthub/ui/button';
import { Card, CardContent } from '@ncthub/ui/card';
import { ArrowRight } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';

export default function FooterCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.5 }}
      viewport={{ once: true }}
      className="mt-16 text-center"
    >
      <Card className="mx-auto max-w-2xl border-primary/20 bg-gradient-to-r from-primary/10 to-secondary/10">
        <CardContent className="p-8">
          <h3 className="mb-4 text-2xl font-bold">
            Ready to Join Our Community?
          </h3>
          <p className="mb-6 text-muted-foreground">
            Experience the difference that makes NEO Culture Tech the premier
            choice for technology enthusiasts
          </p>
          <Button
            size="lg"
            className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-black hover:from-yellow-500 hover:to-yellow-700"
          >
            Get Started Today
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
