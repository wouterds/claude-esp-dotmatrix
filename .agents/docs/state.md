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

**The one the user last sent a message to. Nothing else moves it.**

Not activity. Activity means the panel follows whatever is busiest, which is both
wrong - the session being watched is the one just typed into, not the one making
the most noise - and unstable: two grinding sessions each fire hooks several
times a second, so the panel flickers between them and settles on neither.

Two clocks doing two jobs. `spokenAt` decides which session gets the panel;
`at` decides whether it still counts at all.

When the messaged session goes quiet the panel goes **idle** rather than handing
over to whatever else is running. Handing over would be a switch nobody asked
for, and the whole point of the rule is that switches are deliberate.

A session whose hooks were wired mid-flight has no prompt recorded. Those compete
only when nothing has been spoken to at all, so one can never take the panel off
a session the user actually typed into.

A hand-over plays a **full-screen arrow** in a colour picked per playing, so a
switch is something seen rather than something noticed after the fact.

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

## One dot for the chats that want you

Top right, blinking three times a second - fast, because it is the only thing on
the panel that wants acting on, where the face and the gauge are information.

How many chats are stuck on you is in the **colour**, not in more pixels: yellow
for one, orange for two, red for three or more, in the gauge's own three colours
so nothing here invents a second vocabulary. A row of indicators would compete
with the face for a panel this size.

It counts the session being shown as well as the others. That one is still a chat
that wants you.

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
