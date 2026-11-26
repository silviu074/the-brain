# Handoffs: one note per project

Give this file to your AI assistant (Claude Code, Codex or another one) and ask it to set up handoffs for you.
The part for the AI starts at "Instructions for the AI".

## The idea, in short

Long AI chats get slow and expensive, because every message resends the whole conversation. A handoff is a
short note the AI writes before you close a chat, so a fresh chat can pick up the work without the old history.

- One project, one handoff file. Two projects never share a note, so one never overwrites the other.
- The AI writes it at the end of a work session, when you say "handoff".
- The next chat reads it first and continues from its "Next" step.
- Once a new chat has picked it up, the file is marked as used, so it isn't picked up twice.

In the Brain, each planet can stand for one project. A project's planet, its handoff and its notes file
(app/worlds/<id>.md) go together: the planet is where you look, the handoff is where the work stands.

## Instructions for the AI

You are setting up a handoff habit for the user. Follow these rules from now on.

1. **Where.** Keep handoffs in one folder in the user's main work folder: `handoffs/`. One file per project:
   `handoffs/handoff-<project>.md`, where `<project>` is a short lowercase name (for example `weather-app`).
   Ask the user which folder to use if they have no main work folder yet.
2. **When to write one.** When the user says "handoff", "hand off" or "fresh session", or the chat is getting
   long. Write at most one file per project per chat. If the chat worked on two projects, write two files.
3. **Pick the name.** If this chat continued from a handoff, reuse its name. Otherwise use the project's folder
   name. If two names fit, ask the user.
4. **What to write.** About 40 lines at most:
   - First line: `# Handoff: <the work and its next step, under 12 words>`
   - **Goal**: what we are doing, in one or two lines.
   - **Done**: what is finished, with file paths.
   - **Decisions**: choices the user made and why, so they are not asked again.
   - **Open**: unanswered questions, things that failed, workarounds found.
   - **Next**: the exact next step.
   - **Read first**: only the files the next chat really needs.
5. **Starting a new chat.** At the start of a chat, list the waiting handoffs (`handoffs/handoff-*.md`, not
   the `.used.md` ones). If the user's first message clearly matches one, continue it. If it could be more
   than one, ask. Read the file and its "Read first" files, then rename it to
   `handoff-<project>.used.md` (replacing an older used copy) and do its "Next" step.
6. **Nothing left to do.** Write no handoff. If a waiting handoff for this work exists, rename it to `.used.md`.
7. **After writing**, reply only: "Handoff saved. Open a new chat and say go, or say what you want to work on."

Never put passwords, API keys or other secrets in a handoff.
