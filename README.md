# claude-status

A desk pet that shows what Claude is doing.

An 8x8 RGB matrix on an ESP32-S3, over USB. A face for the mood, a border or a
sweep for what the session is busy with, the top row for how far through the
rolling session window, and the bottom row for how much context is left. Every so
often it stops and dances.

```bash
npm install
npm run firmware:flash   # once
npm start                # the daemon - background it and leave it
npx status-install       # so it follows you into every project
```

Then nothing. Status arrives on its own from Claude Code's own lifecycle hooks -
across every project and every session at once, following whichever one you are
actually typing in.

```bash
npx status-show          # the panel, the sessions, the board, the daemon
npx status-preview       # watch it in a terminal, with no board attached
npx status-play heart
```

No board yet? `npx status-preview` renders the whole thing in a terminal.

## Reading further

| | |
| --- | --- |
| [AGENTS.md](AGENTS.md) | the architecture, and why each boundary is where it is |
| [.agents/docs/](.agents/docs/) | the board, the protocol, the state model |
