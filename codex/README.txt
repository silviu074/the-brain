THE BRAIN (Codex edition)
A live 3D map of your Codex setup: your AGENTS.md, skills, agents, plugins,
MCP servers and guards, plus a replay of every prompt and a live view of Codex working.

NEEDS
- Windows 10 or 11 (64-bit)
- Codex, used at least once (so the .codex folder exists)
- An internet connection (see below)
Nothing else to install: Node.js v24.22.0 (official build, MIT license) is included in app\node.

INSTALL
1. Unzip this folder anywhere.
2. Double-click "Install The Brain.cmd".
3. Open "The Brain (Codex)" from your Desktop or Start menu.

WHAT IT READS (only on your PC, nothing is sent anywhere)
- %USERPROFILE%\.codex (or CODEX_HOME): config.toml, AGENTS.md, skills, plugins, agents, rules, sessions
- %USERPROFILE%\.agents\skills
It never reads auth.json. The local server only listens on 127.0.0.1:8766 and stops
5 minutes after you close the window.

The page loads three.js and fonts from the internet (jsdelivr, Google Fonts), so it needs a connection.

REMOVE
Double-click "Uninstall The Brain.cmd". Your Codex files are not touched.
