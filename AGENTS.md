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

- Ops data (sites, technicians, tasks, activity, field reports, site events) lives in Lovable Cloud tables read directly from the browser client; one realtime channel is mounted in AppShell. Why: single live source for dispatch desk.
- The map uses Leaflet + leaflet.markercluster, lazy-loaded behind ClientOnly. Why: Leaflet touches window at import time.
- Site status history is written by a DB trigger into ops_site_events. Why: history can't be skipped by any client.
