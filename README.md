# Facebook Event Scraper

Small Node.js/Playwright app that searches Facebook Events for technology and programming-related events in Bangladesh and emails a weekly digest.

The scraper searches a set of CSE/technology-related keywords, collects Facebook event links, removes duplicates, and sends the results by email.

## How it works

For each search keyword, the scraper:

1. Searches Facebook Events for `<keyword> Bangladesh`.
2. Loads the search results using an authenticated Firefox session.
3. Scrolls through the results to load additional events.
4. Extracts Facebook event links and candidate event names.
5. Deduplicates events across all searches.
6. Sends the resulting list by email.

The search order, delays, and scrolling behavior are varied between searches so the scraper does not rely on one completely fixed sequence of actions.

> **Note:** The scraper currently collects event names and Facebook event links. It does not yet reliably extract event dates, locations, or distances from Dhaka.

## Search keywords

The current searches cover topics such as:

- Programming contests
- Competitive programming
- Coding contests
- Hackathons
- Datathons
- ICPC
- Robotics competitions
- Artificial intelligence
- Machine learning
- Cybersecurity
- Software competitions
- Informatics olympiads
- Algorithm competitions
- Technology competitions

Each keyword is combined with `Bangladesh` before being searched.

## Local setup

The following steps are also automated by `setup-firefox-github-actions.sh`.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Fill in the required SMTP configuration and email destination.

### 3. Create an authenticated Facebook session

Run:

```bash
npm run auth
```

This opens a visible Firefox browser.

Log in to Facebook manually, then press Enter in the terminal. The script saves the authenticated browser state to:

```text
facebook-storage-state.json
```

Keep this file private. It contains authenticated browser session information and should never be committed to Git.

### 4. Run the scraper

```bash
npm run scrape
```

The scraper will search Facebook Events and send the resulting digest to the configured email address.

### 5. Run tests

```bash
npm test
```

## GitHub Actions

The scheduled workflow is:

```text
.github/workflows/weekly-facebook-event-digest.yml
```

It runs every Friday at:

```text
12:00 UTC
6:00 PM Bangladesh time
```

The workflow:

- Installs Node.js dependencies.
- Installs Firefox for Playwright.
- Restores the authenticated Facebook session from a GitHub secret.
- Runs the scraper.
- Sends the resulting digest by email.

### Required GitHub secrets

The workflow requires the Facebook session state and SMTP configuration to be stored as repository secrets.

The Facebook session is provided through:

```text
FACEBOOK_STORAGE_STATE_B64
```

SMTP and destination-email configuration are also supplied through GitHub Actions secrets.

## Authentication and failures

The scraper uses the saved Facebook browser session instead of requiring a Facebook password during every run.

If Facebook presents a login page, checkpoint, CAPTCHA, or another authentication challenge, the scraper stops rather than attempting to bypass it.

When possible, an error email is sent describing the failure.

## Data collection

The scraper currently collects:

- Event name
- Facebook event URL

It does not currently guarantee extraction of:

- Event date/time
- Event location
- Distance from Dhaka
- Organizer information
- Event description

These may be added in a future version.

## Project structure

```text
.
├── scraper.js
├── auth.js
├── digest-utils.js
├── test/
│   └── digest-utils.test.js
├── setup-firefox-github-actions.sh
├── .github/
│   └── workflows/
│       └── weekly-facebook-event-digest.yml
├── .env.example
├── package.json
└── README.md
```

## License

MIT
