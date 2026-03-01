RR Pokédex Checklist — Offline-first PWA (Web App)
==================================================

What you get
- Search by name, number, or variant label
- Caught ✅ and Shiny ✨ per row (Shiny implies Caught)
- Variants/forms: Add / Rename / Delete variant rows
- Offline-first: after the first successful "Refresh list", it works with little/no internet
- Export/Import to back up your progress as a JSON file

IMPORTANT: First-time setup needs internet once
----------------------------------------------
1) Open the app in Chrome.
2) Tap "Refresh list" once to download the Pokédex list.
3) After that, it will work offline because it caches the list + your progress locally.

How to run it
-------------
You must serve it from a website (service workers won't work from file://).

A) Quick local server (PC)
   - Install Python 3
   - In this folder:
       python -m http.server 8080
   - Open: http://localhost:8080

B) Host it free on GitHub Pages (best for phone install)
   - Create a GitHub repo
   - Upload these files/folders:
       index.html, app.js, sw.js, manifest.json, icons/
   - Enable Settings -> Pages -> Deploy from branch
   - Open the Pages URL on your phone

Install on Samsung (Chrome)
---------------------------
- Open the site in Chrome
- Tap menu (⋮) -> "Add to Home screen" / "Install app"

Offline tips
------------
- After installing, open it once while online and press "Refresh list".
- From then on, it will keep working even in airplane mode.
