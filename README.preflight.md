# Trae Preflight

This folder is prepared for `wangxt-967-1`.

Use `.env` for stable local ports and compose project identity:

- APP_PORT: 18267
- API_PORT: 19267
- WEB_PORT: 20267
- DB_PORT: 21267
- REDIS_PORT: 22267

Smoke entry:

```bash
bash scripts/smoke.sh
```

The preflight files are environment scaffolding only. The generated business
project can replace or extend them when needed.
