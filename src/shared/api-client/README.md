# App API boundary

`index.ts` is the public entry point for same-origin JSON reads and validated runtime configuration. HTTP failure, redirects, malformed JSON and invalid required fields fail before reaching components. Optional capabilities require an actual boolean; no credentials or unknown fields are copied into the UI model.

`useRuntimeConfig` owns request lifecycle and cancellation. User choices, favorites and settings stay in their existing storage. This change migrates `/api/config` only. Timetable and walking hooks retain their existing freshness, completeness and error policies; migrate those incrementally rather than replacing their domain validation with a generic cast.
