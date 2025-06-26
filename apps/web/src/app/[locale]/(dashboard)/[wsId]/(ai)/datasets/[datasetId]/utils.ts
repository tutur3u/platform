import { createClient } from '@tuturuuu/supabase/next/server';

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

interface DuplicateRow {
  originalId: string;
  duplicateId: string;
  data: Json;
  originalCreatedAt: string;
  duplicateCreatedAt: string;
}

interface RowData {
  row_id: string;
  dataset_id: string;
  created_at: string;
  cells: Json;
}

export async function getDatasetMetrics(datasetId: string) {
  const supabase = await createClient();

  // Get total columns
  const { count: totalColumns } = await supabase
    .from('workspace_dataset_columns')
    .select('*', { count: 'exact' })
    .eq('dataset_id', datasetId);

  // Get total rows
  const { count: totalRows } = await supabase
    .from('workspace_dataset_rows')
    .select('*', { count: 'exact' })
    .eq('dataset_id', datasetId);

  // Get last updated timestamp from the most recent row
  const { data: lastRow } = await supabase
    .from('workspace_dataset_rows')
    .select('created_at')
    .eq('dataset_id', datasetId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return {
    totalColumns: totalColumns || 0,
    totalRows: totalRows || 0,
    lastUpdated: lastRow?.created_at || null,
  };
}

export async function detectDuplicates(datasetId: string) {
  const supabase = await createClient();
  const uniqueRows = new Map<
    string,
    { id: string; created_at: string; data: Json }
  >();
  const duplicates: DuplicateRow[] = [];
  const allRows: RowData[] = [];
  const pageSize = 1000;
  let lastFetchedRow: RowData | null = null;

  // Fetch all rows using pagination
  while (true) {
    let query = supabase
      .from('workspace_dataset_row_cells')
      .select('row_id, dataset_id, created_at, cells')
      .eq('dataset_id', datasetId)
      .order('row_id', { ascending: true })
      .limit(pageSize);

    // If we have a last row, start after it
    if (lastFetchedRow?.row_id) {
      query = query.gt('row_id', lastFetchedRow.row_id);
    }

    const { data: rows, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch rows: ${error.message}`);
    }

    if (!rows || rows.length === 0) {
      break;
    }

    // Filter out invalid rows and cast to RowData
    const validRows = rows.filter((row): row is RowData => {
      const isValid = Boolean(
        row?.row_id && row.dataset_id && row.created_at && row.cells
      );
      if (!isValid) {
        console.warn(`Skipping invalid row: ${row?.row_id}`);
      }
      return isValid;
    });

    // Add valid rows to our collection
    allRows.push(...validRows);

    // Update last fetched row
    const lastRow = validRows[validRows.length - 1];
    lastFetchedRow = lastRow || null;

    // If we got less rows than the page size, we've reached the end
    if (rows.length < pageSize) {
      break;
    }
  }

  if (allRows.length === 0) {
    return { duplicateCount: 0, duplicateRows: [] };
  }

  // Now process all rows
  for (const row of allRows) {
    try {
      // Create a normalized signature from the row data
      // Sort keys and stringify values consistently
      const normalizedData = Object.entries(row.cells as Record<string, Json>)
        .sort(([a], [b]) => a.localeCompare(b))
        .reduce((obj: Record<string, Json>, [key, value]) => {
          // Handle null values
          if (value === null) {
            obj[key] = null;
            return obj;
          }

          // Convert numbers and booleans to strings for consistent comparison
          if (typeof value === 'number' || typeof value === 'boolean') {
            obj[key] = String(value);
            return obj;
          }

          // Handle arrays by sorting them
          if (Array.isArray(value)) {
            obj[key] = value.slice().sort();
            return obj;
          }

          // Handle nested objects recursively
          if (typeof value === 'object') {
            obj[key] = JSON.parse(JSON.stringify(value));
            return obj;
          }

          obj[key] = value;
          return obj;
        }, {});

      const signature = JSON.stringify(normalizedData);

      if (uniqueRows.has(signature)) {
        const original = uniqueRows.get(signature);
        if (!original) continue;

        // Keep the older row as original
        if (new Date(row.created_at) < new Date(original.created_at)) {
          duplicates.push({
            originalId: row.row_id,
            duplicateId: original.id,
            data: row.cells,
            originalCreatedAt: row.created_at,
            duplicateCreatedAt: original.created_at,
          });
          // Update the unique row to be the older one
          uniqueRows.set(signature, {
            id: row.row_id,
            created_at: row.created_at,
            data: row.cells,
          });
        } else {
          duplicates.push({
            originalId: original.id,
            duplicateId: row.row_id,
            data: original.data,
            originalCreatedAt: original.created_at,
            duplicateCreatedAt: row.created_at,
          });
        }
      } else {
        uniqueRows.set(signature, {
          id: row.row_id,
          created_at: row.created_at,
          data: row.cells,
        });
      }
    } catch (error) {
      console.error(`Error processing row ${row.row_id}:`, error);
    }
  }

  return {
    duplicateCount: duplicates.length,
    duplicateRows: duplicates,
  };
}

export async function removeDuplicates(datasetId: string) {
  const supabase = await createClient();

  // First detect duplicates
  const { duplicateRows } = await detectDuplicates(datasetId);

  if (duplicateRows.length === 0) {
    return { removedCount: 0 };
  }

  // Get the IDs of duplicate rows to remove
  const duplicateIds = duplicateRows.map((dup) => dup.duplicateId);

  // Remove the duplicate rows in batches to avoid timeout
  const batchSize = 100;
  let removedCount = 0;

  for (let i = 0; i < duplicateIds.length; i += batchSize) {
    const batch = duplicateIds.slice(i, i + batchSize);

    // First delete the cells
    await supabase
      .from('workspace_dataset_cells')
      .delete()
      .eq('dataset_id', datasetId)
      .in('row_id', batch);

    // Then delete the rows
    const { error } = await supabase
      .from('workspace_dataset_rows')
      .delete()
      .eq('dataset_id', datasetId)
      .in('id', batch);

    if (error) {
      throw new Error(`Failed to remove duplicates: ${error.message}`);
    }

    // Add the batch size to removed count
    removedCount += batch.length;
  }

  return { removedCount };
}
