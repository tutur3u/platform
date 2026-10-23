import { JoinOutcome } from '@tuturuuu/meet-core/features/call/components/join-outcome';

export default function RoomNotFound() {
  return <JoinOutcome reason="missing" />;
}
