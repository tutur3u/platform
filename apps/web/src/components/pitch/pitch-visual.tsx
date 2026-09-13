'use client';

import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CircleDollarSign,
  Layers,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
} from '@tuturuuu/icons/lucide';
import Image from 'next/image';
import styles from './pitch.module.css';
import { pitchTone } from './pitch-brand';
import { PitchCommerce } from './pitch-commerce';
import type { PitchCopy, SlideId } from './pitch-model';
import art from './pitch-visual.module.css';

const familyIcons = [CalendarDays, MessageSquare, CircleDollarSign, BookOpen];
const peopleIcons = [Sparkles, Users, BookOpen, Layers];

export function PitchVisual({ id, copy }: { id: SlideId; copy: PitchCopy }) {
  if (id === 'pricing' || id === 'calculator')
    return <PitchCommerce id={id} copy={copy} />;
  if (id === 'ai')
    return (
      <div className={art.chart}>
        <div className={art.chartHeading}>
          <Sparkles aria-hidden="true" />
          <span>{copy.credits}</span>
        </div>
        <div className={styles.bars}>
          {copy.creditValues.map((value, index) => (
            <div key={value} style={pitchTone(index)}>
              <div className={styles.row}>
                <span>{[copy.free, copy.plus, copy.pro][index]}</span>
                <strong>{value}</strong>
              </div>
              <div className={styles.track} aria-hidden="true">
                <div
                  style={{
                    width: `${([1000, 10000, 30000][index]! / 30000) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className={art.chartFooter}>
          <ShieldCheck aria-hidden="true" size={18} />
          {copy.principles[2]}
        </div>
      </div>
    );
  if (id === 'opening' || id === 'closing')
    return (
      <div className={art.ecosystem}>
        <div className={art.grid} aria-hidden="true" />
        <svg
          className={art.connections}
          viewBox="0 0 500 440"
          aria-hidden="true"
        >
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              style={pitchTone(i)}
              d={
                [
                  'M250 220 H110 V75',
                  'M250 220 H390 V75',
                  'M250 220 H110 V365',
                  'M250 220 H390 V365',
                ][i]
              }
            />
          ))}
        </svg>
        <div className={art.brandCore}>
          <Image
            src="/media/branding/tuturuuu.svg"
            alt="Tuturuuu"
            width={128}
            height={128}
            priority
          />
        </div>
        {copy.orbitLabels.map((name, i) => {
          const Icon = [CalendarDays, Sparkles, Layers, BookOpen][i]!;
          return (
            <div key={name} className={art.satellite} style={pitchTone(i)}>
              <Icon size={22} aria-hidden="true" />
              <span>{name}</span>
            </div>
          );
        })}
        <div className={art.signature} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={pitchTone(i)} />
          ))}
        </div>
      </div>
    );
  if (id === 'workflow' || id === 'roadmap')
    return (
      <ol className={art.journey}>
        {(id === 'workflow' ? copy.stages : copy.roadmap).map((item, i) => (
          <li key={item} style={pitchTone(i)}>
            <span className={art.step}>{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3>{item}</h3>
              {id === 'workflow' && (
                <div className={art.miniTimeline} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
            {i < 3 && (
              <ArrowDown
                className={art.connector}
                size={18}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
    );
  if (id === 'business')
    return (
      <div className={art.metrics}>
        {copy.metrics.map((item, i) => (
          <div className={art.metric} key={item} style={pitchTone(i)}>
            <span className={art.step}>{String(i + 1).padStart(2, '0')}</span>
            <h3>{item}</h3>
            {i < 3 && <ArrowRight aria-hidden="true" />}
          </div>
        ))}
        <p>{copy.noClaims}</p>
      </div>
    );
  const items =
    id === 'problem'
      ? copy.friction
      : id === 'platform'
        ? copy.families
        : id === 'audience'
          ? copy.people
          : copy.principles;
  return (
    <div className={`${art.cards} ${id === 'problem' ? art.fragmented : ''}`}>
      {items.map((item, i) => {
        const Icon = (
          id === 'platform'
            ? familyIcons
            : id === 'audience'
              ? peopleIcons
              : id === 'trust'
                ? [ShieldCheck, Layers, CircleDollarSign, Check]
                : [Layers, Users, MessageSquare, CircleDollarSign]
        )[i]!;
        return (
          <div className={art.card} key={item} style={pitchTone(i)}>
            <Icon className={art.cardIcon} size={26} aria-hidden="true" />
            <span className={art.cardIndex}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3>{item}</h3>
            {id === 'platform' && <p>{copy.products[i]}</p>}
            <div className={art.miniBoard} aria-hidden="true">
              {[0, 1, 2].map((j) => (
                <span key={j}>
                  <i />
                  <i />
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
