'use client';

import {
  ArrowUpRight,
  BrainCircuit,
  CalendarDays,
  Layers,
  Sparkles,
  Users,
} from '@tuturuuu/icons/lucide';
import Image from 'next/image';
import { pitchTone } from './pitch-brand';
import { PitchCommerce } from './pitch-commerce';
import type { PitchCopy, SlideId } from './pitch-model';
import { PitchSimulation } from './pitch-simulation';
import art from './pitch-visual.module.css';

const icons = [CalendarDays, Users, Layers, BrainCircuit];

export function PitchVisual({ id, copy }: { id: SlideId; copy: PitchCopy }) {
  if (id === 'pricing' || id === 'calculator')
    return <PitchCommerce id={id} copy={copy} />;
  if (id === 'simulation') return <PitchSimulation copy={copy} />;
  const panels = copy.slides[id].panels;
  if (['opening', 'vision', 'closing', 'horizon'].includes(id)) {
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
          <span>{id === 'vision' ? 'MIRA' : 'TUTURUUU'}</span>
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
  if (id === 'ai') {
    return (
      <div className={art.mira}>
        <div className={art.miraGlow} aria-hidden="true" />
        <div className={art.miraTitle}>
          <Sparkles size={22} aria-hidden="true" /> Mira <span>AI</span>
        </div>
        <div className={art.voice} aria-hidden="true">
          {Array.from({ length: 21 }, (_, i) => (
            <i
              key={i}
              style={{ height: `${16 + Math.sin(i * 1.7) ** 2 * 64}px` }}
            />
          ))}
        </div>
        {panels.map((panel, i) => (
          <div className={art.miraRow} key={panel.label} style={pitchTone(i)}>
            <span>0{i + 1}</span>
            <div>
              <h3>{panel.label}</h3>
              <p>{panel.detail}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (id === 'platform' || id === 'context') {
    return (
      <div className={art.ecosystem}>
        <div className={art.ecosystemCore}>
          <Image
            src="/media/branding/tuturuuu.svg"
            alt=""
            width={38}
            height={38}
          />
          <span>Tuturuuu</span>
          <ArrowUpRight size={20} aria-hidden="true" />
        </div>
        {panels.map((panel, i) => {
          const Icon = icons[i]!;
          return (
            <div className={art.domain} style={pitchTone(i)} key={panel.label}>
              <Icon size={24} aria-hidden="true" />
              <div>
                <h3>{panel.label}</h3>
                <p>{panel.detail}</p>
              </div>
            </div>
          );
        })}
        <div className={art.colorRail} aria-hidden="true">
          {icons.map((_, i) => (
            <i key={i} style={pitchTone(i)} />
          ))}
        </div>
      </div>
    );
  }
  const sequential = [
    'shift',
    'workflow',
    'architecture',
    'pilot',
    'roadmap',
    'intelligence',
  ].includes(id);
  return (
    <div
      className={`${art.panels} ${sequential ? art.sequence : ''} ${id === 'problem' ? art.fragments : ''} ${['workforce', 'readiness', 'business', 'evidence'].includes(id) ? art.triptych : ''}`}
    >
      {panels.map((panel, i) => (
        <div className={art.panel} key={panel.label} style={pitchTone(i)}>
          <div className={art.panelNumber}>
            {String(i + 1).padStart(2, '0')}
            <ArrowUpRight size={19} aria-hidden="true" />
          </div>
          <h3>{panel.label}</h3>
          <p>{panel.detail}</p>
        </div>
      ))}
    </div>
  );
}
