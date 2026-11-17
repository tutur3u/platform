# Synthetic isolation acceptance fixture

This nonshipping tool probes a disposable Linux bubblewrap namespace with fixed
RFC documentation addresses. It accepts no endpoint, credentials, environment
configuration or arbitrary program. Run only on an explicitly admitted Linux
host with system Python and bubblewrap; installing either is separate authority.

`python3 scripts/acceptance-fixture/launcher.py` prints `STOP` and exits 2 when
capabilities or canaries are unavailable. A successful run prints
`SYNTHETIC_ONLY`, not production runtime acceptance. Do not execute `fixture.py`
directly on the host. The launcher bounds child execution to five seconds and
clears its environment. Bubblewrap's PID namespace owns fixture descendants.

Run portable unit checks with:

```sh
python3 -B -m unittest discover -s scripts/acceptance-fixture -p 'test_*.py'
```

Unit tests mock subprocess execution. They prove fail-closed control flow, not
Linux kernel namespaces, process teardown, DNS isolation or production safety.
MacStudio cannot supply those runtime proofs. Exact-source Linux acceptance must
separately capture capability availability, canary results and timeout teardown.
No production endpoints or secrets belong in that evidence.

The fixture is trusted local source, not an untrusted-code sandbox. Read-only
`/usr`, `/lib` and `/lib64` expose host runtime files; no claim is made that those
mounts are secret-free. The local source path is not protected against concurrent
host mutation. Network refusal/timeouts are inconclusive and fail the canary;
only unreachable/unsupported-family errors count. These probes do not exercise
an application, Node APIs, DNS resolution or all descendant escape mechanisms.
The fixture fills an acceptance-tooling gap; it establishes no production exploit.
