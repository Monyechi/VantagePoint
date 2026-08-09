VantagePoint - Local Market Intelligence
=========================================

VantagePoint is a desktop app that sweeps a business category and
territory (e.g. "dentists within 15 miles of Denver, CO") and profiles
every business it finds - website quality, contact info, reviews, and
more - so you can build a market report or a prospect list.

Everything runs locally on your machine. Your data and API keys never
leave your computer - there is no server, no account, and no sign-up.


INSTALLING
----------

Windows:
  1. Download the .exe (or .msi) installer from this release.
  2. Double-click it and follow the installer.
  3. Windows SmartScreen may show an "unrecognized app" warning because
     this build isn't code-signed yet. Click "More info", then
     "Run anyway" to proceed.

macOS:
  1. Download the .dmg from this release (universal - works on both
     Apple Silicon and Intel Macs).
  2. Open the .dmg and drag VantagePoint into your Applications folder.
  3. macOS will likely refuse to open it the first time, saying
     VantagePoint "can't be opened because it is from an unidentified
     developer" - this build isn't notarized yet. To open it anyway:
       - Right-click (Control-click) VantagePoint in Applications and
         choose "Open", then confirm "Open" in the dialog.
       - If that doesn't work: System Settings > Privacy & Security,
         scroll down to the "VantagePoint was blocked" message, and
         click "Open Anyway".
     You only need to do this once, on first launch.


FIRST-TIME SETUP
-----------------

VantagePoint is "bring your own API key" - it doesn't ship with any AI
or data provider access built in, so a few things need to be set up
before your first search:

  1. Open Settings and fill in your Seller Profile (used in outreach
     drafts).
  2. Still in Settings, add at least one AI provider API key (e.g.
     DeepSeek or Claude) - this powers search, scoring, and writing.
  3. Go to Connectors and add a search key (SerpAPI, Tavily, or Brave)
     and, if you want to use Market Sweep, a Google Maps Platform key.
  4. Head to Chat or Market Sweep and run your first search.

None of these keys are ever sent anywhere except directly to the
provider you're calling - they're stored in your operating system's
secure credential store (Windows Credential Manager / macOS Keychain),
never in a database or on a server.


USING THE APP
--------------

  Chat              - describe who you're looking for in plain language.
  Signal Search      - the same kind of search, built from dropdowns
                       instead of chat.
  Market Sweep      - enumerate every business of a given type in a
                       territory and get a digital-maturity profile on
                       each one.
  Leads             - the CRM view of everything found, with AI-written
                       summaries.
  Outreach          - generate, edit, and send outreach messages per
                       lead.
  AI Models         - see and change which AI provider/model is used
                       for each task, with per-model cost estimates.
  Connectors        - manage all your third-party API keys in one
                       place.


SUPPORT / SOURCE
------------------

Source code, issues, and future updates:
  https://github.com/Monyechi/VantagePoint
