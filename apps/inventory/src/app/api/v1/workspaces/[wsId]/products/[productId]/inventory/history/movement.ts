import type { InventoryStockMovement } from '@tuturuuu/internal-api/inventory';

type RawNamedRelation = {
  id: string;
  name: string | null;
};

type RawPersonRelation = {
  display_name: string | null;
  email: string | null;
  full_name: string | null;
  id: string;
};

export type RawStockMovement = {
  amount: number;
  beneficiary: RawPersonRelation | RawPersonRelation[] | null;
  beneficiary_id: string | null;
  created_at: string;
  creator_id: string;
  id: string;
  note: string | null;
  operator: RawPersonRelation | RawPersonRelation[] | null;
  unit: RawNamedRelation | RawNamedRelation[] | null;
  unit_id: string;
  warehouse: RawNamedRelation | RawNamedRelation[] | null;
  warehouse_id: string;
};

export function mapStockMovement(
  movement: RawStockMovement
): InventoryStockMovement {
  const beneficiary = firstRelation(movement.beneficiary);
  const operator = firstRelation(movement.operator);
  const unit = firstRelation(movement.unit);
  const warehouse = firstRelation(movement.warehouse);

  return {
    beneficiary: beneficiary ? mapPerson(beneficiary) : null,
    beneficiaryId: movement.beneficiary_id,
    delta: movement.amount,
    direction: movement.amount >= 0 ? 'added' : 'removed',
    id: movement.id,
    note: movement.note,
    operator: operator ? mapPerson(operator) : null,
    operatorId: movement.creator_id,
    quantity: Math.abs(movement.amount),
    timestamp: movement.created_at,
    unit,
    unitId: movement.unit_id,
    warehouse,
    warehouseId: movement.warehouse_id,
  };
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapPerson(person: RawPersonRelation) {
  return {
    email: person.email,
    id: person.id,
    name: person.full_name ?? person.display_name,
  };
}
