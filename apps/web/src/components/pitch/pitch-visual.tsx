'use client';

import Image from 'next/image';
import { MeetScene, TaskScene } from '../capabilities/product-scenes';
import { pitchTone } from './pitch-brand';
import { PitchCommerce } from './pitch-commerce';
import { EvidenceScene } from './pitch-evidence';
import type { PitchCopy, SlideId } from './pitch-model';
import { PitchScene } from './pitch-scenes';
import { PitchSimulation } from './pitch-simulation';
import art from './pitch-visual.module.css';

export function PitchVisual({ id, copy }: { id: SlideId; copy: PitchCopy }) {
  if (id === 'moment' || id === 'references')
    return <EvidenceScene id={id} copy={copy} />;
  if (id === 'pricing' || id === 'calculator')
    return <PitchCommerce id={id} copy={copy} />;
  if (id === 'simulation') return <PitchSimulation copy={copy} />;
  if (id === 'tasks') return <TaskScene copy={copy.capabilities} compact />;
  if (id === 'meet') return <MeetScene copy={copy.capabilities} />;
  const panels = copy.slides[id].panels;
  if (id === 'opening') {
    return (
      <div className={art.universe}>
        <div className={art.orb} aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
        <div className={art.orbit} aria-hidden="true" />
        <div className={art.orbitInner} aria-hidden="true" />
        <div className={art.identity}>
          <Image
            src="/media/branding/tuturuuu.svg"
            alt="Tuturuuu"
            width={100}
            height={100}
            priority={id === 'opening'}
          />
          <span>{'TUTURUUU'}</span>
        </div>
        <div className={art.constellation}>
          {copy.orbitLabels.map((label, i) => (
            <span key={label} style={pitchTone(i)}>
              <i />
              {label}
            </span>
          ))}
        </div>
        <div className={art.orbCaption}>
          {panels.map((panel) => (
            <span key={panel.label}>{panel.label}</span>
          ))}
        </div>
      </div>
    );
  }
  return <PitchScene id={id} copy={copy} />;
}
