'use client';

import { useReducer } from 'react';
import { createRoomAudioGroup, stepRoomAudioGroup } from './group';

export function useRoomAudioGroup(
  config: Parameters<typeof createRoomAudioGroup>[0]
) {
  return useReducer(stepRoomAudioGroup, config, createRoomAudioGroup);
}
