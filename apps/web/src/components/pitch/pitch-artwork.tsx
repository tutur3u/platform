import Image from 'next/image';
import styles from './pitch-artwork.module.css';
import type { PitchCopy } from './pitch-model';

export function PitchArtwork({
  id,
  copy,
}: {
  id: 'horizon' | 'closing' | 'vision' | 'research' | 'engagement';
  copy: PitchCopy;
}) {
  return (
    <figure className={styles.artwork} data-artwork={id}>
      <div className={styles.image} data-story-image>
        <Image
          src={`/media/story/${{ horizon: 'observatory', closing: 'vietnam-starward', vision: 'knowledge-garden', research: 'simulation-world', engagement: 'innovation-studio' }[id]}.webp`}
          alt={copy.art[`${id}Alt`]}
          width={1672}
          height={941}
          sizes="(max-width: 1000px) 90vw, 50vw"
        />
        <span>{copy.art.note}</span>
      </div>
      <figcaption>
        {copy.slides[id].panels.map((panel) => (
          <div key={panel.label}>
            <h3>{panel.label}</h3>
            <p>{panel.detail}</p>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}
