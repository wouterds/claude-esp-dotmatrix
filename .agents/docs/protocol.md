# Wire Protocol

The board decodes frames and does nothing else - no animation, no state, no
notion of what a mood is. Every scene lives on the host, so iterating on how the
pet behaves costs a process restart instead of a reflash.

## A packet

```
0xC1 0xA0  <cmd>  <len>  <payload...>  <xor>
```

`xor` is over `cmd`, `len` and every payload byte. A packet that fails it is
dropped and the firmware answers `err crc` - which matters, because a bad frame
that is *not* rejected renders as noise and looks like a hardware fault.

| cmd | len | |
| --- | --- | --- |
| `0x01` | 192 | a frame - 64 pixels, RGB, in chain order |
| `0x02` | 1 | brightness, 0 to 255 |
| `0x03` | 0 | ping - answers `pong <version>` |
| `0x04` | 0 | clear |

The parser resyncs on the magic bytes, and holds on a second `0xC1` rather than
dropping back to the start: a stray magic byte inside a resync is itself a
candidate for the beginning of the next packet.

Replies are text lines so a human can read them in a serial monitor. On boot:
`claude-status <version> pin=14 leds=64`.

## Frame order and orientation

The module chains its 64 LEDs **down the first column, then down the second** -
top to bottom, left to right. Assume the other way round and the panel is
transposed, which is a reflection: no rotation fixes it, and an orientation
marker comes back with its arms **swapped** rather than turned. That is the tell,
and it is worth knowing because "the display is mirrored somehow" is otherwise
indistinguishable from a wiring fault.

Scenes draw in one orientation and `Frame.toBytes(rotation)` turns the buffer on
its way out, so which way up the panel sits on a desk is a setting rather than a
rewrite.

**Gamma is applied at this boundary**, not by scenes. A WS2812 is close to linear
in its byte and an eye is not, so a fade to a quarter reads as half lit;
correcting here keeps scene arithmetic in the space a human judges it by.

## Row 7 is the gauge

The bottom row is how much context window is left and is never anything else. A
spec holds every status accent out of it, because a trail crossing the gauge
makes the number read high - and that number is the one thing on the panel that
has to be true.
