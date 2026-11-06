/** Minimal class joiner so this package stays independent of `@tuturuuu/utils`. */
export function classNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(' ');
}
