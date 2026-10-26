# FoxHub for Firefox

<p align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="FoxHub Icon" />
</p>

**FoxHub** is a local multi-account Gmail inbox and social/media sidebar built for Firefox.

Instead of keeping ten pinned tabs open just to grab login verification codes, reply to messages, or scroll Reels while waiting on a match or a build, FoxHub keeps your inbox and web apps tucked cleanly in the Firefox sidebar right next to your active tab.

![FoxHub Demo](demo/foxhub-demo.gif)

> Full high-res video: [`demo/foxhub-demo.mp4`](demo/foxhub-demo.mp4)

## Why I Built This

1. **Copying email verification codes in the same window:** Whenever a site asks for a 6-digit login code, FoxHub detects the code inside incoming emails and gives you a one-click **Copy** button right in the sidebar. You grab the code and paste it into the page next to it without switching tabs.
2. **Social & media apps that actually fit a sidebar:** Most desktop websites break or overflow horizontally when squeezed into a 380px sidebar. FoxHub automatically adapts the layouts for **Instagram** (Feed, Reels, DMs), **WhatsApp**, **Discord**, **Telegram**, **Spotify**, **YouTube**, **TikTok**, **X**, **Messenger**, and **Reddit**, and adds a clean bottom navigation bar for jumping between sections.
3. **Instant switching without losing your spot:** Active apps stay alive in the background while you switch between them, so Spotify keeps playing while you check Instagram or read an email.
4. **Security & privacy first (100% local, zero telemetry):** There are no external developer servers, no analytics scripts, and no data collection. Everything runs locally on your machine between Firefox and the sites you already use.

## Main Features

* **Multi-Account Gmail Support:** Automatically picks up all signed-in Firefox Google accounts (`u/0`, `u/1`, `u/2`, etc.) in a unified inbox or per-account tabs.
* **Quick Email Actions:** Read full email threads, copy 2FA codes in one click, reply, archive, delete, star, snooze locally, or listen to emails with Text-to-Speech.
* **10 Built-In Sidebar Apps + Custom URLs:** Instagram, WhatsApp, Discord, Telegram, Spotify, YouTube, TikTok, X, Messenger, and Reddit, plus the option to pin any custom web link.
* **Background Audio & Persistence Modes:** Keep Spotify or YouTube playing seamlessly in the background even when the sidebar/popup is closed, with configurable **Selected Apps**, **Keep All Open**, or **Eco Mode** memory settings.
* **Interactive Video Scrubber & Modal Controls:** Seek through Instagram Reels, TikToks, and YouTube Shorts with a hover timestamp preview bar, plus full-sized Instagram profile post modals with one-click Comment (`💬`) toggle, Play/Pause, and Mute/Unmute controls.
* **8 Warm Themes & Custom Backgrounds:** Choose from 8 warm palettes (*Warm Linen, Botanical Sage, Sakura Morning, Coastal Breeze, Golden Hour, Lavender Cloud, Gallery Paper, Cozy Espresso*), illustrated wallpapers, or upload your own background image.
* **Acoustic Notification Chimes:** Local Web Audio notification chimes with volume control and Do Not Disturb mode.

## What's New in v2.6.1

* **Instagram Sidebar & Lightbox Polish:**
  * Profile post & reel modals now open in a clean, full-sized card view by default and toggle the scrollable comments & reply drawer on demand when clicking the Comment (`💬`) button.
  * Added dedicated Play/Pause click support and a floating Mute/Unmute audio button inside profile post & reel modals.
  * Improved responsive scaling across both compact (`436px`) and wide (`736px+`) sidebar widths with zero letterboxing gaps.
  * Fixed profile header & grid layout persistence when navigating from Reels to user profiles, and sped up Direct (DM) thread switching.
* **Discord Compact Sidebar Support:**
  * Fixed Discord's server & DM rail visibility at compact sidebar widths (`<= 680px`) by preserving CSS subgrid icon alignment and removing clipping masks, with smooth auto-expand on hover.
* **TikTok Action Pill Contrast:**
  * Styled the bottom-right TikTok action bar pill with a frosted glass card and high-contrast white icons and counters.
* **X (Twitter) Feed Stability:**
  * Prevented unwanted automatic feed scrolling on initial load and fresh installs so the timeline always starts cleanly at the top.
* **Interactive Video Scrubber Bar:**
  * Added a sleek bottom scrubber bar with hover timestamp preview and click/drag seeking for Instagram Reels, TikTok, and YouTube Shorts.

## Privacy & Security

* **No Telemetry:** Zero tracking, zero usage metrics, and zero crash reporters.
* **No Middleman Servers:** Your emails and messages never pass through any third-party proxy or backend server.
* **Local Storage Only:** Preferences, themes, and local cache are stored strictly in Firefox's `browser.storage.local`. See [PRIVACY.md](PRIVACY.md) for details.

## How to Install

### Option 1: Load in Firefox Developer / Debugging Mode
1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select [`manifest.json`](manifest.json) or [`foxhub-firefox.zip`](foxhub-firefox.zip) in this repository.

### Option 2: Install Packaged Add-on
Install directly from the packaged [`foxhub-firefox.zip`](foxhub-firefox.zip) archive via Firefox Add-ons.

## Project Structure

```text
├── icons/                  # Transparent warm FoxHub icons (16px to 128px + SVG)
├── src/
│   ├── background/         # Local Gmail polling, cookie/frame header handler, notifications
│   ├── popup/              # Sidebar & toolbar popup UI, multi-frame keep-alive deck
│   ├── options/            # Settings & Theme Studio
│   └── shared/             # Themes, sound synthesizer, Gmail client, sidebar layout optimizer
├── demo/                   # Demo video (.mp4) and preview (.gif)
├── manifest.json           # Firefox WebExtension manifest
├── PRIVACY.md              # Local-first privacy policy
└── LICENSE                 # Mozilla Public License 2.0 (MPL-2.0)
```

## Feedback & Feature Requests

If you have any feedback, run into a bug, or want to see a specific app or feature added, feel free to leave a review on the Firefox Add-ons rating page or open an issue right here on the GitHub repo. I read everything and actively update the extension based on what people actually use.

## License

Released under the [Mozilla Public License 2.0 (MPL-2.0)](LICENSE).
