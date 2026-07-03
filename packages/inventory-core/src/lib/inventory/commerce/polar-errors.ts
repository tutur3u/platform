import 'server-only';

export class InventoryPolarWorkspaceMismatchError extends Error {
  actualWsId: string;
  expectedWsId: string;

  constructor({
    actualWsId,
    expectedWsId,
  }: {
    actualWsId: string;
    expectedWsId: string;
  }) {
    super('Inventory Polar webhook workspace mismatch');
    this.name = 'InventoryPolarWorkspaceMismatchError';
    this.actualWsId = actualWsId;
    this.expectedWsId = expectedWsId;
  }
}

export function assertInventoryPolarWorkspace({
  actualWsId,
  expectedWsId,
}: {
  actualWsId: string;
  expectedWsId?: string;
}) {
  if (expectedWsId && actualWsId !== expectedWsId) {
    throw new InventoryPolarWorkspaceMismatchError({
      actualWsId,
      expectedWsId,
    });
  }
}
