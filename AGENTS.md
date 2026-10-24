# Working agreement

- The user wants all future website changes on the `preview` branch. Check the current branch before editing. Use the existing checkout; do not create a Git worktree unless explicitly requested.
- Commit and push requested changes to `origin/preview`, after appropriate validation, so the user can review them separately from production.
- Do not merge into `main` or push to `main` until the user explicitly commands a merge. Do not reset or revert existing `main` commits as part of preparing a preview.
- Production is built from `main` at `/SaintsCookies/`. The review site is built from `preview` at `/SaintsCookies/preview/`. Keep these builds separate; never put preview code at the production root.
- When a merge is explicitly requested, fetch both branches, preserve any existing changes, run appropriate checks, merge `preview` into `main` without a force push, and keep `preview` available for the next review cycle.
- Verify the GitHub Actions deployment before claiming a preview or production update is live. If access is blocked, state that the branch is pushed and publication is unverified.
