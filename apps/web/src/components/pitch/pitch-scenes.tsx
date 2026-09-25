import { pitchTone } from './pitch-brand';
import type { PitchCopy, SlideId } from './pitch-model';
import styles from './pitch-scenes.module.css';
import { SceneGeometry } from './scene-geometry';

const diagramViewBoxes: Partial<Record<SlideId, string>> = {
  vision: '0 100 600 240',
  intelligence: '0 15 600 330',
  workforce: '0 40 600 300',
  evidence: '0 30 600 330',
  readiness: '0 45 600 275',
};

export function PitchScene({ id, copy }: { id: SlideId; copy: PitchCopy }) {
  const panels = copy.slides[id].panels;
  return (
    <figure className={styles.scene} data-scene={id}>
      <div className={styles.canvas}>
        <svg
          data-pitch-diagram="true"
          viewBox={diagramViewBoxes[id] ?? '0 0 600 380'}
          fill="none"
          role="img"
          aria-label={copy.slides[id].title}
        >
          <SceneGeometry id={id} copy={copy.visuals} />
        </svg>
      </div>
      <figcaption className={styles.legend}>
        {panels.map((panel, i) => (
          <div key={panel.label} style={pitchTone(i)}>
            <span className={styles.marker} />
            <h3>{panel.label}</h3>
            <p>{panel.detail}</p>
          </div>
        ))}
      </figcaption>
      {['capacity', 'skills', 'evidence', 'roadmap'].includes(id) && (
        <p className={styles.caption}>{copy.diagramNote}</p>
      )}
    </figure>
  );
}
