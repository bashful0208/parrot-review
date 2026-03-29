# Repository Rules

- Do not add dry-run modes, autostart flags, bootstrap-only startup paths, or silent fallbacks for core runtime flows.
- The worker must attempt to connect to Redis and consume jobs on startup. If Redis is unavailable, fail fast with a clear error.
- Do not add local-dev convenience branches that change core behavior between normal startup and production startup.
