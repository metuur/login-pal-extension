Worker-only vault, session, permission and history authority. Validate senders and all runtime inputs, serialize writes, and recheck generation/revisions. Never return passwords to extension UI or logs. Agent backend owns this directory; coordinate content/shared protocols with root.

Explicit group CSV export is a user-authorized exception for transient download data: Settings may receive CSV including synthetic passwords solely to create the requested local download. Never render or log it; revoke its object URL after starting the download. Other views and summaries remain password-free.

Explicit per-account COPY_PASSWORD is a second user-authorized exception of the same shape: a trusted extension page may receive one account's password solely to satisfy a copy gesture, and writes it straight to the clipboard. Never render or log it. State, search results and summaries remain password-free.
