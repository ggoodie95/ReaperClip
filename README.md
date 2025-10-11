# ReaperClip v1.0

Lightweight. No bullshit. ReaperClip is the clipboard manager I always wanted but couldn’t find: instant, unobtrusive, and obsessed with staying out of the way while I get work done.

## Why ReaperClip?

- **Truly lightweight** – No background daemons, no sprawling frameworks, and no installer scripts. `npm install`, `npm start`, done.
- **Fast to summon** – Pops up exactly where your cursor is. Hit the hotkey, pick an item, paste. That’s it.
- **Undercover mode** – Lives in the macOS menu bar, not the dock. Invisible until you need it.
- **Clipboard purist** – Watches text and images (including Control-held screenshots) with a reliable poller. No analytics, no sync, no surprises.
- **Reaper-approved UX** – A clean, frosted-glass UI topped with the ggoodie95 mascot so people remember who kept it simple.

I’ve tried the popular clipboard managers. They were either too busy, too heavy, or tried to upsell me with features I didn’t ask for. ReaperClip does exactly one thing—and does it fast.

## Features

- Global hotkey (default `⌘⇧C`) to toggle the panel at the cursor.
- Instant search across the last 20 text clips.
- Image gallery drawer (`IMG`) with live thumbnails for copied images and Control-held screenshots.
- Menu-bar tray icon with quick Show/Hide and Quit.
- Settings drawer to adjust the hotkey and capture preferences.
- Auto-hides after selection so you keep typing without the extra click.

## Install & Run

```bash
git clone https://github.com/<your-user>/reaperclip.git
cd reaperclip
npm install
npm start
```

That’s the whole story. No brew formulas, no weird post-install scripts.

## Tray Launcher

After the first run you can double-click `ReaperClip.app` (generated in the repo root) to launch it like a native menu-bar utility. Output is logged to `/tmp/reaperclip.log` if you ever need to peek under the hood.

## Controls

- **Toggle panel:** `⌘⇧C` (customizable in Settings)
- **Navigate list:** Arrow keys
- **Choose clip:** `Return`
- **Dismiss:** `Esc`
- **Screenshots:** Hold `Control` while using `⌘⇧3` / `⌘⇧4` to send the capture straight into the IMG tab.

## Settings Drawer

Open the ⚙ toggle in the top-right corner to:
- Set a custom hotkey.
- Enable/disable automatic logging of screenshots.
- Enable/disable general image capture.

Changes apply instantly and persist in `~/Library/Application Support/reaperclip`.

## Development Notes

- Built with Electron 38, pure ES modules, no bundlers.
- Clipboard history and settings are simple JSON stores.
- UI lives under `src/` (plain HTML/CSS/JS), no React/Vue overhead.
- Tray + window coordination handled manually in `src/main.js` for predictability.

### Useful scripts

```bash
npm start       # Run in development
```

If you want a production build, package with your preferred Electron packager (e.g., [`electron-builder`](https://www.electron.build/))—the codebase stays intentionally unopinionated so you can choose the tooling later.

## Credits

- Clipboard watcher, UI, and packaging: **ggoodie95**
- Mascot art: reaper artwork by **ggoodie95** (keep it with the project—this app is the reaper’s home).

## License

Copyright © 2025 ggoodie95. Licensed under the MIT License. If you clutter it up, rename it—ReaperClip stays light.

---

ReaperClip v1.0 – Lightweight clipboard manager. No bullshit. Tell your friends.
