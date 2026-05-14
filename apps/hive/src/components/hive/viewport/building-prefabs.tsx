'use client';

import type { ThreeElements } from '@react-three/fiber';
import type { ReactNode } from 'react';
import type { HiveObjectFootprint } from '@/engine/footprint';
import type { HiveObject } from '@/engine/types';
import {
  CivicHallPrefab,
  WatchtowerPrefab,
  WorkshopPrefab,
} from './civic-building-prefabs';
import { HousePrefab, TownhousePrefab } from './residential-building-prefabs';

type BuildingPrefabProps = {
  common: ThreeElements['group'];
  footprint: HiveObjectFootprint;
  object: HiveObject;
  ringColor: string;
};

export function BuildingPrefab({
  common,
  footprint,
  object,
  ringColor,
}: BuildingPrefabProps): ReactNode {
  const body = getBuildingBody({ footprint, object, ringColor });
  if (!body) return null;

  return <group {...common}>{body}</group>;
}

function getBuildingBody({
  footprint,
  object,
  ringColor,
}: Omit<BuildingPrefabProps, 'common'>) {
  if (object.type === 'house' || object.type === 'cottage') {
    return (
      <HousePrefab
        footprint={footprint}
        object={object}
        ringColor={ringColor}
      />
    );
  }

  if (object.type === 'townhouse') {
    return (
      <TownhousePrefab
        footprint={footprint}
        object={object}
        ringColor={ringColor}
      />
    );
  }

  if (object.type === 'civic-hall') {
    return (
      <CivicHallPrefab
        footprint={footprint}
        object={object}
        ringColor={ringColor}
      />
    );
  }

  if (object.type === 'watchtower') {
    return (
      <WatchtowerPrefab
        footprint={footprint}
        object={object}
        ringColor={ringColor}
      />
    );
  }

  if (object.type === 'greenhouse' || object.type === 'workshop') {
    return (
      <WorkshopPrefab
        footprint={footprint}
        object={object}
        ringColor={ringColor}
      />
    );
  }

  return null;
}
