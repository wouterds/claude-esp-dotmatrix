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

## The gauge

Row 7, and it is the only row with a number on it. Green to 40%, yellow to 60%,
orange to 80%, red beyond - four bands rather than a gradient, because "it is
orange" is a faster read than "it is somewhere between amber and orange". The
leading pixel dims by the fraction of it in use, so the row has eight times the
resolution its eight pixels suggest.

**An accent may brighten it; it may never shorten it.** The spinner crosses the
whole edge, that row included, and is drawn after it so it passes over rather than
behind. A spec holds the invariant, because a bar something could eat into would
read as a smaller number.

## What the eyes are made of

Diagonals only - crosses, arrows and lids. Which shape goes on which mood was
worked out by looking at the panel, not reasoned about, so it is recorded here:

| shape | reads as | used for |
| --- | --- | --- |
| up arrows `^ ^` | cute | happy, zen |
| full crosses | awake | focused, excited |
| flat lid over a pupil | half shut | tired |
| arrows turned inwards `> <` | **angry** | annoyed only |
| one cross over the whole face | done for | dead |

Two shapes were tried and rejected, and both are worth recording because they read
as reasonable written down. The **top half of a cross** (`v v`) is a scowl, not
fatigue. **One pixel per eye** is a fault light, not a sleepy face.

Five shapes for seven moods on purpose: the status carries its own colour, so the
eyes only have to say how the session feels.

A blink has its own lids rather than borrowing tired's shape. Borrowing meant a
blink dropped the eyes to a pixel each, which read as the face cutting out for a
frame.

## Why it reads as alive

Two things, both pure functions of the clock so no scene carries state:

- **A blink** every 4.3 seconds, held for a seventh of one
- **A gaze** every 3.7 seconds: ahead for most of the interval, then one of the
  eight directions for the rest. Hashed off the interval rather than drawn at
  random, so it holds one direction for the whole glance

The periods are prime-ish against each other on purpose, so the two drift instead
of locking into one repeating tic. Only the eyes move for a gaze - the mouth
staying put is what makes it read as a glance rather than the whole head turning.

The eyes sit a row down from the top for the same reason: looking up shifts them by
one, and from row 1 that put pixels on row 0, where two lit corners read as stray
debris rather than as a face.

## Running out of head

Past halfway through the context window the face starts to give, three ways at
once rather than picking one:

| | |
| --- | --- |
| the eyes | half shut at 75%, one cross over the whole face at 95% |
| the colour | tinted towards the gauge's red - a muted rose by 100%, not an alarm |
| the pace | its own clock slows, to half speed by the time the window is gone |

Tinted rather than replaced, so the status is still legible in the colour while the
face reddens. And only the *face* slows - the accents keep real time, because a
sluggish spinner reads as the machine lagging rather than as the pet being tired.

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
