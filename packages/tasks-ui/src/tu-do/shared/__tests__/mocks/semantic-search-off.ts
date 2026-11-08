/** Semantic task search that never returns results, for board tests. */
export const useSemanticTaskSearch = () => ({
  data: [],
  isFetching: false,
  isLoading: false,
});
