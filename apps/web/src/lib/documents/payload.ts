import { z } from 'zod';

const documentFields = {
  name: z.string().nullable(),
  content: z.json(),
  is_public: z.boolean(),
  parent_id: z.uuid().nullable(),
  position: z.number().int().min(-2147483648).max(2147483647).nullable(),
};

export const documentCreateSchema = z.strictObject({
  ...documentFields,
  name: z.string(),
  content: documentFields.content.optional(),
  is_public: documentFields.is_public.optional(),
  parent_id: documentFields.parent_id.optional(),
  position: documentFields.position.optional(),
});

export const documentPatchSchema = z
  .strictObject(documentFields)
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one document field is required'
  );

export function hasHierarchyFields(data: {
  parent_id?: string | null;
  position?: number | null;
}) {
  return data.parent_id !== undefined || data.position !== undefined;
}
