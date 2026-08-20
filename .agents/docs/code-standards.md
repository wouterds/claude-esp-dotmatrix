# Code Standards

## Style

- **Linter and formatter**: Biome, never ESLint or Prettier. Always through
  `npm run lint` / `npm run lint:fix`, never `biome` directly
- **Indentation**: 2 spaces. **Line width**: 100 characters
- **KISS**: the simplest thing that does the job. On a non-trivial change, stop
  and ask whether there is a shape that makes whole branches disappear - prefer
  deleting complexity to rearranging it
- **Clarity over cleverness**: clear names and obvious control flow. If a block
  needs a comment to be understood, first try to rewrite it so it does not
- **Ternaries**: single-expression assignments only. Never nested
- **Guard clauses over ternary returns**: return early on the edge case

## TypeScript

- Avoid `any`. Prefer inference where the type is obvious
- Every package is `strict`, ES2022, bundler resolution
- `export const` with arrow functions, never `function`
- Factory functions returning objects rather than classes - the framebuffer and
  the director are both built this way, and it keeps `this` out of a render loop

## Comments

Default to none - names and small functions are the documentation.

- Explain **why**, never **what**. Delete anything that restates the code
- The bar is consequence: comment when leaving it out would let someone break or
  misuse the thing. A constraint invisible in the code is worth a line
- Keep it to a line or two. Longer means the code should be clearer, or the
  reasoning belongs in the commit message

Most of the comments in this repo are one of three things: a physical limit that
is not in the code (a WS2812's current draw), a failure mode that presents as
something unrelated (a brownout looking like a bad cable), or a decision that
looks arbitrary until you know what it prevents (why the gauge row is sacred).

## Testing

Every test is laid out **given / when / then**, in that order and labelled with
those comments. The setup, the one action under test, and what must be true after
it. A test with no `// when` is testing nothing, and a test with two of them is
two tests.

```ts
it("lights half the row at half spent", () => {
  // given
  const frame = createFrame();

  // when
  drawBar(frame, FIVE_HOUR_ROW, 0.5);

  // then
  expect(litInRow(frame, FIVE_HOUR_ROW)).toEqual([0, 1, 2, 3]);
});
```

Where a case is only meaningful swept across inputs, the loop goes in `// when`
and the assertion with it - the sweep is the action.

What earns a spec here is **arithmetic and rules** - frame addressing, gamma,
the gauge, session expiry, which session speaks. Those are the things that go
wrong silently, because a wrong pixel still renders.

What does not earn one is the serial port or the rendering loop. Those are proven
by running the thing and looking at it - `npx status-preview` for a scene, and
someone with eyes on the panel for anything about the panel.

**Prove a spec can fail.** The one holding status accents out of the gauge row
was written against a bug that was real; it was checked by putting the bug back.

## Change Discipline

- Every changed line traces to the request. No drive-by fixes
- Remove orphans **your** change creates
- Match the surrounding style even where you would do it differently
- Update every consumer directly and **never** re-export from an old location to
  soften a move. Let `npm run typecheck` prove you found them all
