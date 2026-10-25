export function secretsHelp() {
  return `ttr secrets — move secret files in and out of a Passwords vault

Usage: ttr secrets <put|get|list|rotate|reconcile> [options]

  put <name> --from-file <path>     store the file's bytes (1 byte to 5 MiB)
  get <name> --to-file <path>       write the secret to a new mode 600 file
                                    [--force] atomically replaces an existing regular file
  list                              print id and name of each secret
  rotate                            rotate the vault's server-managed key
  reconcile [<request-id>]          ask the server what happened to a write whose
                                    outcome was UNKNOWN; never sends a new write

Options:
  --credentials-file <path>         default ~/.tuturuuu/secrets.json

Values and tokens are never accepted on the command line, read from the
environment or printed. Credentials are a regular file you own with mode 600,
exported from the Passwords app after browser approval: version 1, endpoint
https://passwords.tuturuuu.com, workspaceId, vaultId, a short-lived bearer
token and expiresAt. The CLI holds no data keys; encryption is server-managed.

If a write loses its response the outcome is UNKNOWN: its request id is kept in
a private journal (identifiers and labels only), further writes are refused and
the exit status is 3. Run reconcile; a committed write clears the block.
`;
}
