# Localhost Application Identity — High-Level Design

## Overview

Let Login Pal distinguish applications that share the same URL origin, such as separate local development apps at `http://localhost:5173`. Each existing CSV group remains an application's account boundary. A group may configure how the active page's HTML `<title>` identifies it at each authorized origin. Users can search accounts across all groups, while title-match details are disclosed only inside **Account details**.

## Stakeholders & Impact

- QA and support users can locate accounts for the intended local application without relying on origin alone.
- Application owners can provide a useful page title without adding an extension-specific marker.
- Users can choose a group when titles are absent or ambiguous and can find accounts across groups through search.
- The extension continues to own account storage, app selection, origin permissions, and explicit credential delivery.

## Goals

- Distinguish groups with title rules even when their apps share an origin.
- Support **Title contains** by default and **Title equals** for strict matching.
- Search account data and saved application-identification fields across all groups.
- Keep each result bound to and labeled with its owning group.
- Show observed and configured title-match information only inside **Account details**.
- Preserve existing origin/permission/profile/field checks and require an explicit Fill action.

## Non-Goals

Identifying which local process or backend serves a page; treating the page title as authentication or a security boundary; requiring app code changes; changing ports or hostnames; searching passwords; automatically filling or submitting a form; replacing the existing group/account model.

## Success Criteria

Two groups sharing `localhost:5173` can be distinguished by their configured title rules. A search finds accounts across groups by account data or saved app-identification fields and shows the owning group. Missing or ambiguous title evidence prompts a group choice for page-scoped browsing. A search result preserves its group through details and Fill. Title changes or navigation cannot silently reuse a stale choice. Credential delivery still requires an explicit user action and existing authorization checks.
