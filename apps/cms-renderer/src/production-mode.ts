export function assertProductionMode(mode: string | undefined): void {
  if (mode !== 'production') {
    throw new Error('CMS renderer requires a production server bundle');
  }
}
