// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { heldTabDeviceClaims, useTabDeviceId } from './use-tab-device-id';

function Probe({ meetingId }: { meetingId: string }) {
  return <span>{useTabDeviceId(meetingId, 'account') ?? 'pending'}</span>;
}

it('keeps no claim and shares no id while rendering on the server', () => {
  expect(typeof window).toBe('undefined');
  for (const meetingId of ['m1', 'm2', 'm3'])
    expect(renderToString(<Probe meetingId={meetingId} />)).toContain(
      'pending'
    );
  expect(heldTabDeviceClaims()).toBe(0);
});
