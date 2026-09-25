import { pitchTone } from './pitch-brand';
import type { PitchCopy, SlideId } from './pitch-model';
import styles from './pitch-scenes.module.css';
import { SceneGeometry } from './scene-geometry';

export function PitchScene({ id, copy }: { id: SlideId; copy: PitchCopy }) {
  const panels = copy.slides[id].panels;
  return (
    <figure className={styles.scene} data-scene={id}>
      <div className={styles.canvas}>
        <svg viewBox="0 0 600 380" aria-hidden="true">
          <SceneGeometry id={id} />
        </svg>
        {id === 'platform' && (
          <div className={styles.productNames}>
            {[
              'Tasks',
              'Meet',
              'Calendar',
              'Mira',
              'Mail',
              'Drive',
              'Contacts',
              'Finance',
              'Forms',
              'Learn',
              'Teach',
              'Hive',
              'Nova',
              'Rewise',
              'Git',
            ].map((name, i) => (
              <span style={pitchTone(i)} key={name}>
                {name}
              </span>
            ))}
          </div>
        )}
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
