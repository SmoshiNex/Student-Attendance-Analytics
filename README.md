# Student Attendance Analytics

This repository contains the Smart Campus Attendance system.

## Security

- Do NOT commit secrets or `.env` files.
- The application reads runtime settings from the project root `.env` file.
- If a secret is exposed, rotate it immediately and remove it from git history.
- This repository now includes a GitHub Action (`.github/workflows/secret-scan.yml`) that runs `gitleaks` on pushes and PRs to detect accidental secrets.
