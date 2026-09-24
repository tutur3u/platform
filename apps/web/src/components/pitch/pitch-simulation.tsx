'use client';

import { useState } from 'react';
import type { PitchCopy } from './pitch-model';
import art from './pitch-visual.module.css';

export function PitchSimulation({ copy }: { copy: PitchCopy }) {
  const t = copy.simulation;
  const [people, setPeople] = useState(6);
  const [hours, setHours] = useState(24);
  const [demand, setDemand] = useState(180);
  const capacity = people * hours;
  const gap = demand - capacity;
  const maximum = Math.max(demand, capacity, 1);
  return (
    <div className={art.simulation}>
      <div className={art.windowBar} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <h2>{t.title}</h2>
      {[
        {
          id: 'people',
          label: t.people,
          value: people,
          set: setPeople,
          min: 1,
          max: 20,
          step: 1,
        },
        {
          id: 'hours',
          label: t.hours,
          value: hours,
          set: setHours,
          min: 4,
          max: 40,
          step: 2,
        },
        {
          id: 'demand',
          label: t.demand,
          value: demand,
          set: setDemand,
          min: 40,
          max: 600,
          step: 10,
        },
      ].map(({ id, label, value, set, ...range }) => (
        <div className={art.input} key={id}>
          <div className={art.inputHeading}>
            <label htmlFor={`scenario-${id}`}>{label}</label>
            <output htmlFor={`scenario-${id}`}>{value}</output>
          </div>
          <input
            id={`scenario-${id}`}
            type="range"
            {...range}
            value={value}
            onChange={(event) => set(Number(event.target.value))}
          />
        </div>
      ))}
      <div className={art.results} aria-live="polite" aria-atomic="true">
        <div>
          <span>{t.capacity}</span>
          <strong>
            {capacity} <small>{t.unit}</small>
          </strong>
        </div>
        <div>
          <span>{gap > 0 ? t.gap : t.headroom}</span>
          <strong>
            {Math.abs(gap)} <small>{t.unit}</small>
          </strong>
        </div>
      </div>
      <div className={art.compare} aria-hidden="true">
        <span style={{ width: `${(capacity / maximum) * 100}%` }} />
        <span style={{ width: `${(demand / maximum) * 100}%` }} />
      </div>
      <details>
        <summary>{t.baseline}</summary>
        <p>{t.baselineDetail}</p>
      </details>
      <p className={art.caption}>{t.caveat}</p>
    </div>
  );
}
