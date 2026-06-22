export interface Horse {
  id: number;
  speed: number;
  color: string;
}

export interface Race {
  horses: number[];
  result: number[];
  raceType: 'preliminary' | 'championship' | 'candidate';
  raceDescription: string;
}

export interface RelationshipData {
  fasterThan: Set<number>;
  slowerThan: Set<number>;
  potentialRange: {
    min: number;
    max: number;
    confidence: number;
  };
}

export type SpeedDistribution =
  | 'uniform'
  | 'normal'
  | 'exponential'
  | 'clustered';
