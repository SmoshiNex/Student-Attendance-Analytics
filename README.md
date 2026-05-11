# Student Attendance Analytics

This repository contains the Smart Campus Attendance system.

## Security

- Do NOT commit secrets or `.env` files. Use the provided `.env.example` as a template.
- If a secret is exposed, rotate it immediately and remove it from git history.
- This repository now includes a GitHub Action (`.github/workflows/secret-scan.yml`) that runs `gitleaks` on pushes and PRs to detect accidental secrets.
