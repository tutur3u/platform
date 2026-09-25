import Image from 'next/image';
import styles from './pitch-artwork.module.css';
import type { PitchCopy } from './pitch-model';

export function PitchArtwork({
  id,
  copy,
}: {
  id: 'horizon' | 'closing';
  copy: PitchCopy;
}) {
  return (
    <figure className={styles.artwork} data-artwork={id}>
      <div className={styles.image}>
        <Image
          src={`/media/story/${id === 'horizon' ? 'observatory' : 'vietnam-starward'}.webp`}
          alt={id === 'horizon' ? copy.art.horizonAlt : copy.art.closingAlt}
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
