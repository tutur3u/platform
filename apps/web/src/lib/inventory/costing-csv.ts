import type { InventoryCostImportPreview } from '@tuturuuu/internal-api/inventory';

const REQUIRED_COLUMNS = [
  'Item Category',
  'Batch Size (Units)',
  'Mfg cost/Unit',
  'Total cost/Unit',
  'Target Retail Price',
];

const columnAliases = {
  batchSize: ['Batch Size (Units)', 'Batch Size'],
  itemCategory: ['Item Category', 'Category', 'Item'],
  manufacturingCostPerUnit: [
    'Mfg cost/Unit',
    'Manufacturing Cost/Unit',
    'Manufacturing Cost',
  ],
  partnerProfitPerSale: [
    'Veizo Profit Per Sale',
    'Partner Profit Per Sale',
    'Platform Profit Per Sale',
  ],
  talentProfitPerSale: ['Talent Profit Per Sale', 'Creator Profit Per Sale'],
  targetRetailPrice: ['Target Retail Price', 'Retail Price', 'Price'],
  totalCostPerUnit: [
    'Total cost/Unit',
    'Total Mfg. Cost + Shipping/Unit',
    'Total Cost/Unit',
  ],
} as const;

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseMoney(value: string | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/[$,%\s]/g, '').replaceAll(',', '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function findValue(
  row: Record<string, string>,
  aliases: readonly string[],
  fallback = ''
) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== '') {
      return row[alias];
    }
  }

  return fallback;
}

export function parseInventoryCostingCsv(
  csv: string
): InventoryCostImportPreview {
  const warnings: string[] = [];
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      rows: [],
      warnings: ['CSV must include a header row and at least one data row.'],
    };
  }

  const headers = parseCsvLine(lines[0] ?? '');
  const missing = REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column)
  );

  if (missing.length > 0) {
    warnings.push(`Missing recommended columns: ${missing.join(', ')}.`);
  }

  const rows: InventoryCostImportPreview['rows'] = [];
  let currentCategory = '';

  for (const [index, line] of lines.slice(1).entries()) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(
      headers.map((header, cellIndex) => [header, values[cellIndex] ?? ''])
    );
    const itemCategory = findValue(
      row,
      columnAliases.itemCategory,
      currentCategory
    );

    if (itemCategory) currentCategory = itemCategory;

    const batchSize = parseMoney(findValue(row, columnAliases.batchSize));
    const manufacturingCostPerUnit = parseMoney(
      findValue(row, columnAliases.manufacturingCostPerUnit)
    );
    const totalCostPerUnit = parseMoney(
      findValue(row, columnAliases.totalCostPerUnit)
    );
    const targetRetailPrice = parseMoney(
      findValue(row, columnAliases.targetRetailPrice)
    );

    if (
      !currentCategory ||
      batchSize === null ||
      manufacturingCostPerUnit === null ||
      targetRetailPrice === null
    ) {
      warnings.push(`Skipped row ${index + 2}: missing required costing data.`);
      continue;
    }

    rows.push({
      batchSize,
      itemCategory: currentCategory,
      manufacturingCostPerUnit,
      partnerProfitPerSale: parseMoney(
        findValue(row, columnAliases.partnerProfitPerSale)
      ),
      talentProfitPerSale: parseMoney(
        findValue(row, columnAliases.talentProfitPerSale)
      ),
      targetRetailPrice,
      totalCostPerUnit,
    });
  }

  if (rows.length === 0) {
    warnings.push('No importable costing rows were found.');
  }

  return { rows, warnings };
}
