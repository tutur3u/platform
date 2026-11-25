'use client';

import type {
  PrejoinCapture,
  PrejoinMediaPreferences,
} from './use-prejoin-capture';

type GuestMedia = {
  meetingId: string;
  preferences: PrejoinMediaPreferences;
  audioPermissionPending: boolean;
  videoPermissionPending: boolean;
};

// The guest form and connected stage are two renders of the same route.
// Carry device intent through the refresh without keeping media tracks alive.
let request: GuestMedia | undefined;

export function rememberGuestMedia(meetingId: string, capture: PrejoinCapture) {
  request = {
    meetingId,
    preferences: {
      audioDeviceId: capture.audioDeviceId,
      videoDeviceId: capture.videoDeviceId,
      outputDeviceId: capture.outputDeviceId,
      audioEnabled: capture.audioEnabled,
      videoEnabled: capture.videoEnabled,
    },
    audioPermissionPending: capture.audioPermissionPending,
    videoPermissionPending: capture.videoPermissionPending,
  };
}

export function guestMediaRequest(meetingId: string) {
  return request?.meetingId === meetingId ? request : undefined;
}

export function forgetGuestMedia(meetingId: string) {
  if (request?.meetingId === meetingId) request = undefined;
}
