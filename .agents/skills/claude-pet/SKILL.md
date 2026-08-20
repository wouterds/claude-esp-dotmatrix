---
name: claude-pet
description: Bring the desk pet up and keep it running for a whole session - the ESP32 matrix that shows what Claude is doing, how the session is going, and how much context is left. Use when asked to start the pet, wake the matrix, show status on the display, or when the panel is dark and should not be. Runs until the session ends.
---

# Claude Pet

An 8x8 RGB matrix on the desk, showing what this session is doing. A face for the
mood, a border or a sweep for what it is busy with, and the bottom row for how
much context window is left.

**The hooks do the ordinary work.** `.claude/settings.json` wires every lifecycle
event to `.claude/hooks/status.mjs`, so status follows the session with nothing
asked of you. What this skill is for is the half hooks cannot do: getting the
daemon up, proving the panel is right, and the deliberate moments.

**Those hooks only fire in this repo.** `npx status-install` puts the same one in
the user's own settings so the pet works in every project - a dry run by default,
`--write` to apply.

## Bring it up

One process owns the serial port. Everything else writes a file.

```bash
npx status-board          # is the board on usb, and does its firmware answer
npm run pet               # start it - detaches, and outlives the session
npx status-show           # board, daemon, status, mood, window, all at once
```

`npm run pet` is safe to run twice - it reports the pid it already has rather
than starting a second one. `npm run pet:stop` clears the panel on the way out,
and waits for the port to actually be released. `npm run pet:restart` is what to
use after changing anything the daemon renders, because it loads its code once at
startup.

**Do not start it as a plain backgrounded Bash call.** The daemon holds stdin, so
npm waits on it and the call never returns - which reads as the daemon hanging
rather than the runner holding the door open. The script closes stdin for exactly
this reason.

**A dark panel is one of four things**, and `npx status-show` names which:

| | |
| --- | --- |
| board not found | the cable, or a hub that dropped the port |
| daemon not running | nothing is driving it |
| brightness 0 | it is being driven, at nothing |
| painted cells | someone left `status-pixel` holding the panel - `--clear` |
| no sessions | no hooks are wired here - `npx status-install` |

## What it is showing

Read the panel as three things. Row 0 is how far through the rolling session
window; the six rows between are the face; row 7 is how much context is left.
Both bars are numbers - the spinner crossing them can brighten them, never
shorten them.

| status | on the panel |
| --- | --- |
| `idle` | breathing slowly, eyes shut |
| `thinking` | a dot orbiting the border |
| `working` | a column sweeping side to side |
| `reading` | a row sweeping down |
| `running` | the border pulsing |
| `waiting` | corners blinking - **the user's move** |
| `error` | red, flashing, eyebrows down |
| `done` | green, a tick, then a smile |

Mood comes from how full the context window is rather than from what is
happening: past three quarters it looks tired, past 95% it gives out.

The eyes are all one motif - a cross, and halves of it. Full crosses awake, the
bottom half (two carets) content, the top half drooping, a brow over it cross,
and one cross across the whole face for done for. Five shapes for seven moods on
purpose: the status already carries its own colour, so the eyes only have to say
how the session feels.

The context gauge is banded: green to 40%, yellow to 60%, orange to 80%, red
beyond. The session-window bar is cool blue and never reddens - elapsed time is
information, not a warning. **The real session-window percentage cannot be read
locally**; `/usage` fetches it from the API and nothing caches it, so the bar
shows time through the window instead, which is exact.

**One pulsing pixel in the top right corner** means a *different* session is
blocked on the user. The panel is already saying what this session is doing;
that pixel is the only way it can say both at once.

## Several sessions at once

Every session reports itself, and the panel speaks for **the one the user last
sent a message to**. Nothing else moves it - not activity, not how busy something
is. A hand-over plays a full-screen arrow in a random colour, so a switch is seen
rather than noticed afterwards.

A session stops counting once it goes quiet: ninety seconds for anything active,
half an hour for `waiting` (nothing changes there until the user acts), five
minutes for `error`. When the messaged session goes quiet the panel goes **idle**
rather than handing over to whatever else is running - that would be a switch
nobody asked for.

`npx status-show` lists them, newest first, and marks the one being spoken for.
That is the command for "which of my four sessions needs me".

## Driving it deliberately

```bash
npx status-set thinking            # pins the panel - hooks do this, you rarely need to
npx status-set --auto              # release the pin, follow the sessions again
npx status-play heart              # --list for all of them
npx status-pixel 0,0,#ff0000       # individual pixels, pet off duty
npx status-pixel --clear           # hand the panel back
npx status-brightness 12           # 0 to 96
npx status-preview                 # the panel, in the terminal, no board needed
```

**The daemon already does the pet part.** It interjects an antic every 40 seconds
or so, spread around that mean, and flips back to status when it ends. You do not
need a loop to make it feel alive, and adding one on top only makes it noisy.

What is worth doing by hand is **punctuation** - an antic at a moment that meant
something:

- `status-play heart` when the user says something kind
- `status-play bolt` when a long build or test suite finally goes green
- `status-play cross` when you broke something and know it
- `status-play dance` when you shipped

Keep it rare. An antic every few minutes reads as a reaction; one a minute reads
as a screensaver.

## What it will not do

Two statuses are never talked over: `error`, and `waiting`. Both are the user's
move, and a dance covering either is the difference between a pet and a
distraction. Arriving at one also cancels whatever was mid-antic.

## Which way up

Not knowable from a terminal, and every face is wrong in three of the four cases.
The panel has to be dialled in once, by someone who can see it:

```bash
npx status-orient                  # white origin, red arm +x, green arm +y
npx status-orient --rotation 90    # try each until the legend matches
npx status-orient --done           # clear the marker
```

**Ask the user what they see.** This is the one thing in the project that cannot
be verified from here, so do not record it as working on the strength of the
frame having been sent.

## Rules

- **Never let the pet cost the session anything.** A hook that blocks or a tool
  that throws makes the display worse than not having one. Every write is a
  file write, and every failure is silent on purpose
- **One daemon.** It holds a pid lock, because two writing to one port tears the
  panel and reads as a bad cable
- **Stop it properly** (`SIGTERM`, or the pid in `~/.claude-status/daemon.pid`).
  Killed harder, the last frame stays lit and a stopped pet looks like a frozen
  one
- **`status-pixel` is a takeover.** Leaving cells set leaves the pet off duty for
  the rest of the session
- **`status-set` pins the panel** until `--auto` releases it. Set it and forget,
  and the pet stops following the session it is supposed to be showing
