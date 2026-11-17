# Cloudstep

A cozy endless jumping game with an animated rabbit, layered parallax hills and forest, floating meadow islands, flowers, gems, and optional synthesized sound. All graphics are drawn locally on Canvas; no dependencies, build step, or network connection required.

## Open and play

From the project folder:

```sh
cd /home/pyag/dev/simplegame
python3 -m http.server 5173
```

Open **http://localhost:5173/jumping/** and click **LET’S WANDER**.

You can also open `/home/pyag/dev/simplegame/jumping/index.html` directly in a modern browser.

## Controls

- **Space**, **↑**, or **W**: jump. Press again in midair to double jump.
- **Touch**: tap the scene or the large **JUMP** button.
- **P** or **Escape**: pause/resume. Space also resumes while paused.
- **R**: restart.
- Running is automatic. Jump over stumps and gaps between islands.
- Each gem awards **25 bonus points**. Distance also adds points, and running gradually gets faster.
- Sound is off by default; use **SOUND OFF** to enable it.

The game pauses when you leave the tab/window. Best scores are saved in this browser; blocked storage falls back to a session best. Reduced-motion preferences disable decorative particles, bobbing and run animation; gameplay and essential scrolling remain.

## Files

- `index.html`: game page and accessible controls.
- `style.css`: responsive visual design.
- `engine.js`: independent game rules and terrain generation.
- `game.js`: Canvas scenery, animation, input, sound, and storage.
- `tests/engine.test.cjs`, `tests/ui.test.cjs`: rule and UI tests.

Run all games’ tests from the project folder:

```sh
node --test tests/*.test.cjs jumping/tests/*.test.cjs
```

Your existing Snake game is unchanged at `../index.html`.
