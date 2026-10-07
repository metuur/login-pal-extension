---
format: 960x720
duration: 20s
message: "Import test accounts, authorize a site, choose an account, and fill on request."
arc: Import → Authorize → Choose → Fill
audience: QA and support teams
mode: collaborative
---

## Review status
Storyboard v1 proposed. User requested review before build; production proceeds end to end after approval. Sketches are illustrative workflow diagrams, not captured product screens. Existing homepage is unchanged.

## Direction
Silent. Persistent panel and synthetic account row tie the beats together. Four 5-second beats total 20 seconds. Final 2 seconds are held. No automatic submission, passwords, fabricated metrics, or animated browser chrome. Runtime and playback integration begin only after approval.

## Implementation plan
Single seekable HyperFrames composition, one continuous scene with four states, using the dynamic-content-sequencing and stat-bars-and-fills atomic rules. No hard scene cuts or scene-worker dispatch needed. Local playback adapter adds controls without changing deterministic timeline. The registry query returned broadly related cards and many fetch failures; do not treat that incomplete response as exhaustive evidence. Revisit primitives before animation implementation.

## Frame 1 — Import (0–5s)
- status: outline
- src: index.html
- duration: 5s
- scene: CSV becomes an account group
- narrativeRole: explain the input
- motion: staggered row arrival; power3.out, 0.45s

“Import your test accounts.” A CSV tile and three fictional account-name rows. “CSV → searchable account group”. Rows settle into the persistent panel. No password values or invented import success metrics.

## Frame 2 — Authorize (5–10s)
- status: outline
- src: index.html
- duration: 5s
- scene: A specific site is approved
- narrativeRole: establish user control
- motion: leftward content handoff; power2.inOut, 0.4s

“Authorize your login site.” Show “https://qa.example.com” with “Configure fields → approve access”. Caption: “Importing accounts does not grant site access.” An approval mark lands only after the explicit authorization step. Not a replica of Chrome’s permission dialog.

## Frame 3 — Choose (10–15s)
- status: outline
- src: index.html
- duration: 5s
- scene: A selected test account
- narrativeRole: demonstrate search and selection
- motion: discrete search-state change; selection emphasis

“Find the account you need.” Search by “Admin” highlights “Alex Morgan · Admin” in a symbolic account list. Caption: “Search by name, ID, or metadata.” Selection occurs before any fill is depicted.

## Frame 4 — Fill (15–20s)
- status: outline
- src: index.html
- duration: 5s
- scene: Selected account is ready on the approved page
- narrativeRole: explain the result and boundary
- motion: selected row moves to destination; progress line fills; final hold

“Fill. Then sign in yourself.” Selected account connects to a “Login fields ready” destination. Caption: “Choose Autofill. You press the site’s Login button.” No credential values, no animated submit, no implied authentication success.
