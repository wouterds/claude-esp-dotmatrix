# State

One process holds the serial port. Everything else writes a file and leaves.

That is the whole design, and it is chosen for the hooks: one fires and returns
whether or not the pet is running, so nothing in a session ever waits on, or
fails because of, a display.

```
~/.claude-status/
  state.json           deliberate settings and overrides - the tools write this
  daemon.pid           whoever holds the port
  sessions/<id>.json   one per claude session - the hooks write these
```

## Where a status comes from

In precedence order:

1. **`state.json.status`** - an override. `status-set` pins it, `status-set --auto`
   releases it. Null by default
2. **The live session the user typed into most recently** - see below
3. **`idle`**, when nothing is live

Recency, not priority. A session parked on a permission prompt must not stop the
panel showing the one actually being worked in.

## Which live session speaks

Ranked on the **last user prompt**, not on the last activity. Two sessions
grinding at once both fire hooks several times a second, so ranking on activity
makes the panel flicker between two statuses and settle on neither.

The last prompt is a stable key. It does not move while a session works, so the
session being worked in keeps the panel until the user moves - and the other one
drops out on its own once it goes quiet, because *liveness* is still activity.
Two clocks, two jobs: `at` decides whether a session still counts, `spokenAt`
decides which of the ones that count gets the panel.

A session whose hooks were wired mid-flight has no prompt recorded, and falls
back to activity rather than being ignored.

## Why a session expires

Without expiry, "most recent" means the last thing touched holds the panel
forever - a session that ended on `done` says `done` all night. So a snapshot
describes its session only for as long as it plausibly still does, and the two
kinds of claim get different clocks:

| | |
| --- | --- |
| anything active | 90 seconds - it is a claim about right now |
| `waiting` | 30 minutes - nothing more happens until the user acts, which stays true |
| `error` | 5 minutes - long enough to see after stepping away, short enough that an abandoned session does not own the panel all afternoon |

`SessionEnd` deletes the file rather than setting idle. Left behind, a closed
session stays a candidate and competes with live ones as the quietest of them.

## Two things at once

Arbitrating between "this session is working" and "that one is blocked on you"
always loses one of them, so the panel says both: face and accent for the session
being worked in, one pulsing corner pixel for a *different* session that is
waiting. When the session being shown is itself waiting, the panel already says
so and the pip is not drawn.

## The window

Read from the transcript of the session being shown, not from whichever
transcript was touched last. Those are the same thing with one session open and
quietly wrong with four.

Which context window a session runs on is not recorded in a transcript, so the
narrowest one the reading still fits in is used. A wide session reads low early
and corrects itself as it fills - the right way round, because a gauge that
overstates is one nobody looks at twice. `CLAUDE_STATUS_CONTEXT` overrides it.

## Validation lives in the daemon

`state.json` is hand editable and written by hooks, so every field is checked on
read. That is what lets the hook stay dumb and fast: it writes the one field it
owns and validates nothing, and a daemon that died on a stray comma would take
the panel with it and blame whatever touched it last.
