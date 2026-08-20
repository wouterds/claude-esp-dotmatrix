# AGENTS.md

A desk pet. An 8x8 RGB matrix on an ESP32-S3, showing what Claude is doing, how
the session is going, and how much context window is left.

| | |
| --- | --- |
| `firmware/` | the sketch on the board - decodes frames, nothing else |
| `packages/matrix` | the panel: wire protocol, serial port, framebuffer, colour |
| `packages/pet` | what the pet *is*: state, mood, faces, scenes, sessions |
| `packages/tools` | executables that answer one question or set one thing |
| `apps/daemon` | the one process that holds the port and renders |
| `.claude/hooks` | where status comes from, on its own |

## Stack

Turborepo with npm workspaces. TypeScript, Node 24, `serialport`. Biome for lint
and formatting, knip for dead code, vitest for specs. The firmware is Arduino via
PlatformIO. The toolchain lives in the root manifest; anything imported at
runtime lives beside what imports it.

## Commands

Run from the repo root - turbo fans them out.

| | |
| --- | --- |
| `npm start` | the daemon - background it and leave it |
| `npm run lint:fix` | lint and format |
| `npm run typecheck` | typecheck |
| `npm test` | vitest across every workspace |
| `npx knip` | dead code and unused dependencies |
| `npm run firmware:build` | compile the sketch |
| `npm run firmware:flash` | and put it on the board |

```bash
npx status-show          # everything at once - start here when the panel is dark
npx status-preview       # the panel, in a terminal, with no board
npx status-install       # wire the hook into every project, not just this one
npx status-play dance
npx status-pixel 0,0,#ff0000
```

## Rules

- **NEVER** bypass pre-commit hooks (`--no-verify`, `LEFTHOOK=0`)
- **NEVER** call biome directly - use `npm run lint` or `npm run lint:fix`
- **NEVER** commit without being explicitly asked
- **NEVER** put a Claude or co-author trailer on a commit
- Atomic commits, conventional messages, max 100 chars per line
- Prefer the smallest change that does the job
- Find root causes - no temporary or hacky fixes

## Guides

- [Hardware](.agents/docs/hardware.md) - the board, flashing, and the two things
  that cost a day
- [Wire Protocol](.agents/docs/protocol.md) - packets, frame order, and why gamma
  is applied where it is
- [State](.agents/docs/state.md) - sessions, precedence, expiry, and where
  validation lives
- [Code Standards](.agents/docs/code-standards.md) - style, TypeScript, comments

## Skills

- [`claude-pet`](.agents/skills/claude-pet/SKILL.md) - bring the panel up, read
  it, and keep it running for a session. Symlinked into `.claude/skills`.

## Constraints

Invisible in the code until they are broken.

- **One process owns the serial port.** Two daemons both write frames and the
  panel tears between them, which reads as a bad cable rather than as a second
  process - hence the pid lock. Everything else writes a file and leaves, which
  is what lets a hook fire and return whether or not the pet is running
- **Nothing in a session may wait on, or fail because of, the display.** The
  hooks are plain node with no imports because tsx costs 290ms against node's
  34ms and they run on every tool call. They never print and always exit 0
- **The daemon validates; the writers do not.** `state.json` is hand editable and
  hook written, so every field is checked on read. That is what makes it safe for
  the hook to stay dumb
- **Row 7 is the token gauge and nothing else may light it.** A spec holds every
  status accent out of it. A trail crossing the gauge makes the number read high,
  and that number is the one thing on this panel that has to be true
- **Scenes are pure functions of time and state.** No scene carries anything
  between frames - the twinkle is hashed from the pixel and the step rather than
  from `Math.random` - which is why a spec can assert what was drawn
- **Gamma is applied at the wire, not in scenes**, so scene arithmetic stays in
  the space a human judges brightness by
- **The firmware knows nothing.** No animation, no state, no notion of a mood.
  Every scene lives on the host, so iterating on behaviour costs a restart rather
  than a reflash
- **Which way up the panel sits cannot be verified from here**, and every face is
  wrong in three of the four cases. `npx status-orient` draws a marker that
  cannot be read two ways; someone with eyes on it decides
