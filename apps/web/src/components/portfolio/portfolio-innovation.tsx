'use client';

import {
  ArrowDown,
  ArrowUpRight,
  BrainCircuit,
  Layers3,
  Sparkles,
} from '@tuturuuu/icons/lucide';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import Image from 'next/image';
import { ProductMark } from '../capabilities/product-mark';
import { pitchTone } from '../pitch/pitch-brand';
import type { PortfolioCopy } from './portfolio';
import styles from './portfolio-innovation.module.css';

const chapters = [
  {
    id: 'products',
    image: 'innovation-studio',
    Icon: Sparkles,
    products: ['Tasks', 'Calendar', 'Meet', 'Mail'],
  },
  {
    id: 'platform',
    image: 'knowledge-garden',
    Icon: Layers3,
    products: ['Drive', 'Contacts', 'Finance', 'Chat'],
  },
  {
    id: 'intelligence',
    image: 'simulation-world',
    Icon: BrainCircuit,
    products: ['Mira', 'Hive', 'Mind', 'Rewise'],
  },
];

export function PortfolioInnovation({
  copy,
}: {
  copy: PortfolioCopy['innovation'];
}) {
  return (
    <section className={styles.innovation}>
      <header data-reveal>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
        <div className={styles.manifesto}>
          <p>{copy.body}</p>
          <p>{copy.promise}</p>
        </div>
      </header>
      <Tabs defaultValue="products" className={styles.chapters}>
        <TabsList className={styles.tabList} aria-label={copy.explore}>
          {chapters.map(({ id, Icon }, i) => (
            <TabsTrigger className={styles.tab} value={id} key={id}>
              <Icon size={18} />
              <span>0{i + 1}</span>
              {copy.chapters[i]!.tab}
            </TabsTrigger>
          ))}
        </TabsList>
        {chapters.map(({ id, image, products }, i) => {
          const chapter = copy.chapters[i]!;
          return (
            <TabsContent value={id} key={id} className={styles.chapter}>
              <div className={styles.scene} data-story-panel>
                <figure data-story-image>
                  <Image
                    src={`/media/story/${image}.webp`}
                    alt={chapter.alt}
                    width={1672}
                    height={941}
                    sizes="(max-width: 900px) 100vw, 65vw"
                  />
                  <figcaption>{copy.artNote}</figcaption>
                </figure>
                <div className={styles.chapterCopy}>
                  <span className={styles.chapterNumber}>0{i + 1}</span>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.body}</p>
                  <div className={styles.products}>
                    {products.map((product) => (
                      <span key={product}>
                        <ProductMark product={product} size={26} />
                        {product}
                      </span>
                    ))}
                  </div>
                  <p className={styles.proof}>
                    <ArrowUpRight size={18} />
                    {chapter.proof}
                  </p>
                </div>
              </div>
              <section className={styles.cycle} aria-label={copy.cycle}>
                {chapter.steps.map((step, n) => (
                  <div key={step.title} style={pitchTone(n)} data-story-panel>
                    <span className={styles.stepNumber}>0{n + 1}</span>
                    <h4>{step.title}</h4>
                    <p>{step.body}</p>
                    {n < 2 && (
                      <ArrowDown
                        className={styles.stepArrow}
                        aria-hidden="true"
                        size={18}
                      />
                    )}
                  </div>
                ))}
              </section>
            </TabsContent>
          );
        })}
      </Tabs>
      <footer>
        <span className={styles.signal} aria-hidden="true" />
        <p>{copy.footer}</p>
      </footer>
    </section>
  );
}
