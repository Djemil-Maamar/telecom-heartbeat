<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Ops data lives in Lovable Cloud tables read from the browser client under role-based RLS (has_role / is_dispatcher / my_technician_id); one realtime channel is mounted in AppShell. Why: rights enforced in the database, not the UI.
- All app pages live under src/routes/_authenticated; the first account is made admin by ensureProfile, later accounts get no role until an admin grants one. Why: no open access.
- Offline: query cache persisted to localStorage; field writes go through runOrQueue (src/lib/offline.ts) and are replayed on reconnect. Why: field use without network.
- The map uses Leaflet + leaflet.markercluster, lazy-loaded behind ClientOnly. Why: Leaflet touches window at import time.
- Site status history is written by a DB trigger into ops_site_events. Why: history can't be skipped by any client.
- AI field-report analysis runs in a requireSupabaseAuth server fn (src/lib/gpm-ai.functions.ts → gpm-ai.server.ts, Responses API, structured output) and the result is saved on ops_field_reports.ai_analysis. Why: key stays server-side and the analysis is kept with the report.
