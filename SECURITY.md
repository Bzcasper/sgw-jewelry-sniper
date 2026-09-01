# Security

- Bearer tokens in `env` only, `0600`, never in git. `gitleaks` blocks push.
- `frx-isolated` profile per run (`isolated-home`), never default.
- Report vulns via GitHub Security Advisories, not public issue.
- Dependabot weekly for `ts`/`rs`/`docker`/`actions`; `deny.toml` bans GPL, `cargo deny` in CI future.
