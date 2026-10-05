# Account Login Assistant

Use the approved docs/hld, docs/lld, docs/ears and docs/tasks/account-login-assistant.md as the product contract. Source is strict TypeScript, MV3, packaged local assets only. Prefix shell commands with rtk. Read nearest AGENTS.md before edits. Read current official dependency docs through Context7. Prefer codebase-memory graph queries; when unavailable disclose and use exact source reads.

Credentials never belong in logs, UI, diagnostics, persistent plaintext, test reports or screenshots. Use only synthetic test data. Background owns crypto/session state and serialized writes. Content scripts receive only the chosen credentials on explicit user action. UI receives password-free summaries. No automatic form submission.

Agents share the checkout: own assigned modules, preserve others' edits, run scoped tests only. Root coordinates build, full tests, commits and task completion. Create/update source-directory AGENTS.md when introducing directories. Do not mark a task complete without observed evidence and a real landed commit.
