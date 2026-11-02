export function canTranscribeMeet(left: boolean, participants: number) {
  return !left && participants >= 1;
}
