export function transactionTagQuery(tagIds: string[]) {
  return {
    select: () => ({
      in: () => ({
        eq: async () => ({ data: tagIds.map((id) => ({ id })), error: null }),
      }),
    }),
  };
}
