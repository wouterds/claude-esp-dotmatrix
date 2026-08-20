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

## Two things at once

Arbitrating between "this session is working" and "that one is blocked on you"
always loses one of them, so the panel says both: face and accent for the session
being worked in, one pulsing corner pixel for a *different* session that is
waiting. When the session being shown is itself waiting, the panel already says
so and the pip is not drawn.

## Running out of head

Past halfway through the context window the face starts to give, and it does it
three ways at once rather than picking one:

| | |
| --- | --- |
| the eyes | droop to the top half of a cross at 75%, become one full-face cross at 95% |
| the colour | tinted towards the gauge's red, most of the way there by 100% |
| the pace | its own clock slows, to half speed by the time the window is gone |

Tinted rather than replaced, so the status is still legible in the colour while
the face reddens. And only the *face* slows - the accents keep real time, because
a sluggish spinner reads as the machine lagging rather than as the pet being
tired.

All three run off the **context** window, not the subscription's. That is the one
the pet is running out of head in.

## The two bars

Row 0 and row 7 are numbers, not decoration, and the face has the six rows
between them.

| | |
| --- | --- |
| row 0 | how far through the rolling **session window** - cool blue, never reddens |
| row 7 | how full the **context window** is - green to 40%, yellow to 60%, orange to 80%, red beyond |

The gauge is banded rather than a gradient because "it is orange" is a faster read
than "it is somewhere between amber and orange". Both bars dim their leading pixel
by the fraction of it in use, so each has eight times the resolution its eight
pixels suggest.

**The session window figure cannot be read locally.** What `/usage` reports is
fetched from the API and cached nowhere on disk - not in `stats-cache.json`, not in
`policy-limits.json`, not in the transcripts, whose only related field is
`service_tier`. So the bar shows what *is* exactly knowable: how far through the
window we are, derived from message timestamps. A window anchors on the first
message of an unbroken run and then tiles forward, so a twelve hour stretch is the
third window rather than one long overrun.

**An accent may brighten a bar; it may never shorten one.** The spinner crosses
the whole edge, both bars included, and is drawn after them so it passes over
rather than behind. A spec holds the invariant, because a bar something could eat
into would read as a smaller number.

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
