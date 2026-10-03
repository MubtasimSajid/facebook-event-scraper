# Scraper for Facebook events

Small Facebook event digest app that runs weekly & emails them.

## Local setup

The following steps are automated in `setup-firefox-github-actions.sh` Bash script.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example env file & fill in your values:

   ```bash
   cp .env.example .env
   ```

3. Run one-time local login to save Facebook browser state:

   ```bash
   npm run auth
   ```

   This opens a visible browser. Log in manually, then press Enter in the terminal. The script saves the authenticated state to `facebook-storage-state.json`.

4. Run the scraper manually:

   ```bash
   npm run scrape
   ```

## GitHub Actions schedule

- Workflow: `.github/workflows/weekly-facebook-event-digest.yml`
- Schedule: every Friday at 6:00 PM Bangladesh time (12:00 UTC)
- Authentication: set `FACEBOOK_STORAGE_STATE_B64` secret with base64 of your local `facebook-storage-state.json`.
- SMTP credentials & destination email are provided through repository secrets.

## Notes

- The scheduled job reuses the saved authenticated session & doesn't require a Facebook password.
- If login checkpoints, CAPTCHA, or re-authentication pages appear, the run stops & sends an error email.
- Only public event details are collected: title, schedule, location, distance from Dhaka (if resolvable) & event link on Facebook.
