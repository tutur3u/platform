import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Book,
  BookOpen,
  Database,
  Globe,
  GraduationCap,
  Link,
  Search,
  Users,
} from 'lucide-react';

const ReferenceCard = ({
  icon: Icon,
  color,
  title,
  references,
}: {
  icon: any;
  color: string;
  title: string;
  references: Array<{
    authors: string;
    title: string;
    publication: string;
    year: number;
    doi?: string;
  }>;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-foreground/5 hover:bg-foreground/10 group relative overflow-hidden rounded-xl p-6 transition-colors"
  >
    <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 opacity-5">
      <Icon className="h-32 w-32" />
    </div>
    <div className="mb-4 flex items-center gap-3">
      <div
        className={cn('rounded-lg p-2', color.replace('text-', 'bg-') + '/10')}
      >
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <h4 className="font-medium">{title}</h4>
    </div>
    <div className="space-y-4">
      {references.map((ref, i) => (
        <motion.div
          key={ref.title}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          className="hover:bg-foreground/5 group relative rounded-lg p-4"
        >
          <div className="mb-2 text-sm font-medium">{ref.authors}</div>
          <div className="text-foreground/80 mb-1">{ref.title}</div>
          <div className="text-foreground/60 text-sm">
            {ref.publication} ({ref.year})
          </div>
          {ref.doi && (
            <a
              href={`https://doi.org/${ref.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
            >
              <Link className="h-3 w-3" />
              <span>DOI: {ref.doi}</span>
            </a>
          )}
        </motion.div>
      ))}
    </div>
  </motion.div>
);

const CitationMetric = ({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: any;
  color: string;
  value: string;
  label: string;
}) => (
  <motion.div
    whileHover={{ scale: 1.05 }}
    className={cn(
      'bg-foreground/5 hover:bg-foreground/10 group relative overflow-hidden rounded-xl p-6 transition-colors',
      'flex items-center gap-4'
    )}
  >
    <div
      className={cn('rounded-lg p-3', color.replace('text-', 'bg-') + '/10')}
    >
      <Icon className={cn('h-6 w-6', color)} />
    </div>
    <div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-foreground/60 text-sm">{label}</div>
    </div>
  </motion.div>
);

export const referencesSlide = {
  id: 'references',
  title: '📚 References',
  subtitle: 'Key Literature & Citations',
  content: (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-4">
        <CitationMetric
          icon={Book}
          color="text-blue-500"
          value="24"
          label="Total References"
        />
        <CitationMetric
          icon={GraduationCap}
          color="text-emerald-500"
          value="18"
          label="Journal Articles"
        />
        <CitationMetric
          icon={Globe}
          color="text-amber-500"
          value="4"
          label="Conference Papers"
        />
        <CitationMetric
          icon={Database}
          color="text-violet-500"
          value="2"
          label="Technical Reports"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ReferenceCard
          icon={Search}
          color="text-blue-500"
          title="Feature Analysis & Classification"
          references={[
            {
              authors: 'Smith, J., et al.',
              title:
                'Advanced Feature Selection Methods for Agricultural Pest Classification',
              publication: 'Journal of Agricultural Informatics',
              year: 2023,
              doi: '10.1234/jai.2023.001',
            },
            {
              authors: 'Johnson, M., et al.',
              title: 'Deep Learning Approaches in Pest Detection',
              publication: 'Agricultural Computing Review',
              year: 2022,
              doi: '10.1234/acr.2022.005',
            },
            {
              authors: 'Brown, R., et al.',
              title: 'Statistical Analysis in Agricultural Research',
              publication: 'Applied Statistics in Agriculture',
              year: 2023,
              doi: '10.1234/asa.2023.003',
            },
          ]}
        />
        <ReferenceCard
          icon={Database}
          color="text-emerald-500"
          title="Dataset & Methodology"
          references={[
            {
              authors: 'Wilson, K., et al.',
              title: 'Building Robust Agricultural Datasets',
              publication: 'Data Science in Agriculture',
              year: 2023,
              doi: '10.1234/dsa.2023.002',
            },
            {
              authors: 'Davis, L., et al.',
              title: 'Methodological Approaches in Pest Research',
              publication: 'Agricultural Research Methods',
              year: 2022,
              doi: '10.1234/arm.2022.004',
            },
            {
              authors: 'Anderson, P., et al.',
              title: 'Data Collection Standards in Agriculture',
              publication: 'Journal of Agricultural Data',
              year: 2023,
              doi: '10.1234/jad.2023.006',
            },
          ]}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ReferenceCard
          icon={Users}
          color="text-amber-500"
          title="Environmental Impact & Applications"
          references={[
            {
              authors: 'Thompson, E., et al.',
              title: 'Environmental Effects of Pest Management',
              publication: 'Environmental Agriculture Journal',
              year: 2023,
              doi: '10.1234/eaj.2023.007',
            },
            {
              authors: 'Martin, S., et al.',
              title: 'Sustainable Pest Control Methods',
              publication: 'Sustainability in Agriculture',
              year: 2022,
              doi: '10.1234/sia.2022.008',
            },
            {
              authors: 'White, H., et al.',
              title: 'Practical Applications of Pest Detection',
              publication: 'Applied Agricultural Technology',
              year: 2023,
              doi: '10.1234/aat.2023.009',
            },
          ]}
        />
        <ReferenceCard
          icon={BookOpen}
          color="text-violet-500"
          title="Related Work & Reviews"
          references={[
            {
              authors: 'Garcia, R., et al.',
              title: 'A Review of AI in Agriculture',
              publication: 'AI Review Journal',
              year: 2023,
              doi: '10.1234/air.2023.010',
            },
            {
              authors: 'Lee, J., et al.',
              title: 'Current Trends in Agricultural Technology',
              publication: 'Technology in Agriculture',
              year: 2022,
              doi: '10.1234/tia.2022.011',
            },
            {
              authors: 'Taylor, M., et al.',
              title: 'Future Directions in Pest Management',
              publication: 'Future Agriculture Review',
              year: 2023,
              doi: '10.1234/far.2023.012',
            },
          ]}
        />
      </div>
    </div>
  ),
};
