# Web E2E Captures

Captured from the 2026-09-05 production build using the Cuckoo Cue brand asset set and real BigQuery, Vertex AI and Memory Bank services.

1. `00-google-login-production.png`: Firebase Google login gate with the canonical cuckoo mark.
2. `01-empty-desktop.png`: authenticated search workspace and branded empty state.
3. `02-search-results-desktop.png`: deduplicated real search-result cards with fit context and compact task previews.
4. `03-import-ready-desktop.png`: target-day import prepared with absolute task dates and no desktop-only Android action.
5. `04-save-review-desktop.png`: completed-list review with absolute dates, priorities and named LLM groups.
6. `05-search-results-mobile.png`: responsive search results without clipped or inert controls.
7. `06-android-save-handoff-mobile.png`: responsive completed-list review with editable absolute dates and groups.
8. `07-save-published-desktop.png`: successful BigQuery publication.
9. `08-empty-mobile.png`: mobile search workspace with the canonical handoff mark.

The login gate is captured with the production Firebase client configuration. Post-login states are captured from `next start` with development identity enabled because Google's interactive account chooser is not automated. Search, enrichment and profile retrieval call the real services; no API response is mocked. Browser locale is fixed to `ja-JP` so native date controls match the product language. The publication confirmation image remains evidence from the earlier successful real-service flow because the quality capture deliberately stops before creating another public corpus row.
