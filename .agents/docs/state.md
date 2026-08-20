# State

One process holds the serial port. Everything else writes a file and leaves.

That is the whole design, and it is chosen for the hooks: one fires and returns
whether or not the pet is running, so nothing in a session ever waits on, or
fails because of, a display.

```
~/.claude-status/
  state.json           deliberate settings and overrides - the tools write this
  limits.json          the 5h and weekly quotas - the statusline writes this
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

A hand-over plays **three full-height arrowheads** sweeping the panel, in a colour
picked per playing and turning direction each time. Stacked heads read as a
direction where one arrow with a tail read as an object being dragged, and
alternating says "it moved" where one fixed direction eventually reads as
decoration.

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

## The antics run on their own

The daemon interjects one every 24 seconds or so with a fresh window, stretching
to two minutes with a spent one. Nothing has to ask for it.

**Only `error` and a spent quota suppress them.** A red flashing face is the
message and an antic replaces the face. `waiting` used to suppress them too,
and that was a bug rather than a policy: Claude Code raises a notification once a session has been idle a
minute, so sitting at the desk doing nothing set the status to waiting and stopped
the antics altogether - the panel went still exactly when there was most reason
for it not to be.

That suppression existed because the corner dot was painted *inside* the status
scene, so an antic hid it for its whole run. The dot is an overlay now, painted
over whatever is playing, which is what made letting them run safe.

## One dot for the chats that want you

Top right, blinking three times a second - fast, because it is the only thing on
the panel that wants acting on, where the face and the gauge are information.

How many chats are stuck on you is in the **colour**, not in more pixels: yellow
for one, orange for two, red for three or more, in the gauge's own three colours
so nothing here invents a second vocabulary. A row of indicators would compete
with the face for a panel this size.

It counts the session being shown as well as the others. That one is still a chat
that wants you.

## The two gauges

Row 7 is the rolling 5h quota and row 0 is the week. Green to 40%, yellow to 60%,
orange to 80%, a warm dark red beyond - four bands rather than a gradient, because
"it is orange" is a faster read than "it is somewhere between amber and orange".
The leading pixel dims by the fraction of it in use, so a row has eight times the
resolution its eight pixels suggest.

Both draw identically, same bands at the same brightness: **position is what tells
them apart.** A second vocabulary for the top row - dimmer, or mirrored, or a
colour of its own - would be one more thing to learn than a panel this size can
carry. The 5h window is on the bottom because it is the one that bites first, and
so the one glanced at.

They are **account-wide, unlike the face above them**. The face runs on the context
window of the session being shown, so it still behaves like the chat you are in;
these two are the same figures in every chat, which is what lets a row show one
without having to say whose it is.

A quota nothing has reported stays **dark**, and a bar is never shorter than **one
pixel**. Those two together are what make a dark row mean one thing: a row
defaulting to empty would read as "none of the week used", which is the one wrong
answer here that looks like good news - and without the floor, a window that has
just reset and a statusline that has never fired would draw the same blank row.

The floor costs the sub-pixel dimming below an eighth, so anything under 12.5%
reads as one whole pixel rather than a dim one. Worth it: "barely started" is the
only thing that range has to say, and it is the range a fresh window sits in.

**An accent may brighten a bar; it may never shorten one.** The spinner crosses the
whole edge, both rows included, and is drawn after them so it passes over rather
than behind. A spec holds the invariant, because a bar something could eat into
would read as a smaller number.

## When a quota runs out

Either bar reaching 100% takes the panel over: **the cross and a dead face in
turn**, both glowing in the error red, five seconds a cycle.

Not the same thing as a full context window. That is the pet running out of head
and the face already says it. This is the account having nothing left to spend
until the window turns over, which no amount of face can say.

Alternating rather than either half holding, because a panel that never changes
reads as a crashed one - and this is the state most likely to be stared at while
someone works out whether the thing is still alive.

The bars come back under the face for its half, and **the row that ran out takes
the cross's red and its breath with it** rather than sitting at the top gauge
band. The band tops out at a warm orange that reads as "nearly", and this is past
nearly. The other row keeps its own colour, which is how you see *which* of the
two went.

Antics are suppressed throughout, the same as an error. And the cross is no
longer in the antic pool at all: it means one thing now, so seeing it at random
would spend the only signal this state has.

## What the eyes are made of

Diagonals only - crosses, arrows and lids. Which shape goes on which mood was
worked out by looking at the panel, not reasoned about, so it is recorded here:

| shape | reads as | used for |
| --- | --- | --- |
| up arrows `^ ^` | cute | happy, zen |
| full crosses | awake | focused, excited |
| flat lid over a pupil | half shut | tired |
| arrows turned inwards `> <` | **angry** | annoyed only |
| arrows turned the same way `> >` | **dazed** | dead only |

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
| the eyes | half shut at 75%, both turned the same way at 95% |
| the colour | tinted towards the gauge's red - a muted rose by 100%, not an alarm |
| the pace | its own clock slows, to half speed by the time the window is gone |
| the antics | come round less often - a little under the mean with room to spare, three times it with none |
| which antics | the energetic ones drain out of the pool and the skull takes over |

The antic weights are interpolated rather than switched at a threshold, so the pet
winds down instead of changing character in one step. A fresh session is mostly
ghosts and hearts; a spent one is mostly the skull, rarely.

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

## Where the quotas come from

`rate_limits` is handed to a **statusline and to nothing else**. No hook payload
carries it, it never reaches a transcript, and nothing caches it on disk - so
holding the statusline slot is the only way to see it. Worth knowing because the
obvious places to look for it are all empty, and one of them is a *stale* file:
`ccstatusline` keeps its own `usage.json` cache, which is the same shape and can
be months out of date.

There is one slot, so `status-install` **wraps** whatever was already in it rather
than replacing it. The wrapped command is handed the identical payload and its
output goes out untouched, so wiring the pet in costs one node start - measured at
510ms to 555ms against `ccstatusline` - and changes nothing on screen. `--remove`
hands the slot back exactly as it was found.

A reading is good **until its own reset and no longer**. Within one window a quota
only ever climbs, so a file nothing has rewritten for an hour still holds the
number, which is what keeps the panel lit between sessions without a staleness
timeout. Past the reset it describes a window that has already started again, and
the row goes dark rather than showing a figure for a window that is gone.

## Validation lives in the daemon

`state.json` is hand editable and written by hooks, so every field is checked on
read. That is what lets the hook stay dumb and fast: it writes the one field it
owns and validates nothing, and a daemon that died on a stray comma would take
the panel with it and blame whatever touched it last.
