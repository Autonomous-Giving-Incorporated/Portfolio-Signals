# Supported Runtime Versions

The repository and staging procedures use the following tested versions:

| Runtime | Pinned version | Authority |
|---|---:|---|
| Node.js | `22.18.0` | `.nvmrc`, `.tool-versions`, GitHub Actions |
| Supabase CLI | `2.31.8` | GitHub Actions and `scripts/staging/bootstrap.env.example` |
| PostgreSQL | `15.8` (`major_version = 15`) | `.tool-versions` and `supabase/config.toml` |

Patch or minor upgrades must be submitted through a pull request that runs the parser and import API tests, resets the disposable Supabase project, and executes the complete SQL policy suite. Hosted staging should not be upgraded ahead of repository validation. Production must remain separately approved and version-aligned before promotion.
