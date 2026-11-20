# Scheduled task: daily agent-log review

Install as a T3 scheduled task once a day (suggested 07:00 ICT) in the main
Tuturuuu checkout. The text below the rule is the task prompt.

---

You review the last 24 hours of fleet and agent activity for recurring tool and
permission failures and open fix tasks for them. Report only to the USER, once,
at the end. Never message other threads.

Sources (read-only):
- T3 threads updated in the last 24 hours (`t3_thread_list`, `t3_thread_search`,
  `t3_thread_read` for the failing ones): tool errors, denied permissions,
  interrupted or hung runs, usage-limit stops.
- `tmp/perf-factory/dispatcher.log`, `tmp/agent-coordination/` notes updated in
  the window, and failed GitHub Actions runs on `main`
  (`gh run list --branch main --status failure --limit 50`).

1. Normalize each failure to a signature: tool or command, error class, and a
   stable fragment of the message with SHAs, paths, IDs and times removed.
   Examples of signatures worth catching:
   - a provider run that finishes its work but never closes, leaving queued
     messages stalled;
   - GitHub API secondary or primary rate limits (`API rate limit exceeded`,
     `secondary rate limit`);
   - zsh modifiers mangling push refspecs such as `$S:refs/heads/...`
     (`:r` read as a history modifier); the fix is `"${S}:refs/heads/..."`;
   - `gh` or GitHub API lookups that fail on short SHAs, where
     `git rev-parse --verify <short>^{commit}` locally is the fix.
2. Count each signature across distinct threads. A signature is recurring when
   it appears in at least 2 threads or 3 times in the window.
3. For each recurring signature, search the Fleet board for an open task with
   the same signature in its description. If one exists, add today's count and
   example thread links to it. Otherwise create a task in **Queued** named
   `tooling: <short signature>` with: the signature, count, up to three example
   thread links, a suspected cause, a proposed fix (guard script, helper, skill
   or doc change, wrapper default, retry/backoff), and the file that should
   change.
4. Do not fix anything in this run and do not touch other threads.

Report: one message listing new and updated `tooling:` tasks with counts,
ranked by count. If nothing recurred, say so in one line. Times in ICT
(GMT+7). Never include tokens, cookies or user data.

Finish by settling this run's own thread with `t3_thread_organize`.
