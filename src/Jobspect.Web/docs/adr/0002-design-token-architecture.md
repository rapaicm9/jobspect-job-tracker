# 0002 — Design tokens: three layers, two colour scales, one density floor

- **Status:** Accepted
- **Date:** 2026-08-08
- **Amended:** 2026-08-21 — dark is the default rather than the system's choice, and light is an
  opt-in carried by a cookie the server reads; the selected tint no longer shares a value with the
  hover tint; the provisional chart slots are settled. See _Revision history_.

## Context

The client targets WCAG 2.2 AA and ships light and dark themes. Colour carries domain meaning in
two places — the pipeline stage of an application and its terminal outcome — and those two are
different kinds of value. A palette settled by eye at this point would be re-litigated at every
review, and a palette hard-coded into components would make a later change a sweep across every
file.

The brand supplies three fixed points: teal `#007A79` for light grounds, `#5BC0BE` for dark, and
Prussian Blue `#0B132B` as the dark ground. The marks in `brand/` are drawn in them.

## Decision

### Three layers, enforced rather than agreed

**Primitives** are raw ramps in `:root`. They live _outside_ Tailwind's `@theme`, so no utility
class is generated for them and a component cannot reach one. **Semantics** are the roles
components read — `--background`, `--stage-offer`, `--border-strong` — bridged to utilities in a
`@theme inline` block. **Component overrides** are the third layer and are currently empty; each
one that lands carries the reason it could not be a semantic token.

`@theme inline` rather than plain `@theme` is required, not stylistic: without `inline` a utility
references the theme variable instead of its value, and a token redefined inside the dark media
query resolves at the wrong level of the cascade.

**Tailwind's default palette is deleted** with `--color-*: initial`. `bg-blue-700` resolves to
nothing, so reaching past the semantic layer fails visibly instead of shipping quietly. `white` and
`black` are theme variables and are re-declared; `transparent`, `current` and `inherit` are
keywords and are unaffected.

### Two colour scales, because the domain has two

The four active stages are ordered, so they take a **sequential** blue ramp. The four outcomes are
not, so they take a **categorical** scale. One palette across all eight would assert a rank among
outcomes that the domain denies — see [0001](0001-board-holds-four-columns.md).

**The ramp direction reverses between themes.** On a light ground progression deepens; on a dark
ground deepening recedes into the background, so the same four steps run the other way and
progression reads as brightening. The invariant is _further along is visually heavier_, not a fixed
lightness direction.

Each stage and outcome carries three tokens, because one value cannot do all three jobs: an
**identity** colour for dots, chart marks and chip borders, clearing 3:1 against the page as a
non-text mark; a chip **surface**; and a **foreground** for text on that surface, clearing 4.5:1.
Stage surfaces deepen along the ramp; outcome surfaces all sit at one lightness, because a
lightness difference among unordered values implies a rank.

**Withdrawn is deliberately near-neutral.** Withdrawing is the user's own decision, and colouring it
like a failure editorialises.

**Colour never carries meaning alone.** Every chip shows its name; colour is redundant encoding.
Luminance gaps inside the outcome set run as tight as 1.09:1, so hue is doing the work and
greyscale removes it — which is why marks are labelled directly rather than keyed to a legend.

### The selected tint is a step clear of the hover tint

`--secondary` carries one job across the whole client: _this one is selected_ — the navigation's
current destination, the command palette's highlighted row, a pressed filter or density toggle.
`--muted` is what those same controls paint on hover. The two originally held the same ramp step,
which made hovering an unselected filter indistinguishable from selecting it: 1.00:1 apart in light
and 1.18:1 in dark.

They are now a step apart, and the step is sized on the measured gap rather than on the ramp. The
light end of the neutral ramp is compressed, so one step there reaches 1.14:1 where one step in dark
reaches 1.56:1 — light takes two steps to land in the same place.

### Two border tokens

`--border` is a divider and exempt from WCAG 1.4.11. `--border-strong` clears 3:1 and is what
identifies a control. Using the subtle one on a text input is the most common way a design system
fails 1.4.11 while looking tidy. In dark mode this is load-bearing rather than decorative: the card
and page surfaces sit 1.22:1 apart, so a card rendered without a border has effectively no edge.

### Charts take their colour from the domain

Most chart marks in this product already have a colour. A funnel bar _is_ the stage it counts and an
outcome breakdown _is_ the outcome it counts, so those read `--stage-*` and `--outcome-*` directly
and a mark matches that value's chip everywhere else on the same screen. There is no separate
categorical chart ramp, and an earlier draft that declared five generic slots was aliasing the stage
blue and three of the four outcome hues under different names — a funnel bar would have been a
different blue from the Offer chip beside it, for no reason a reader could recover.

Two slots remain, for what the domain does not colour:

- `--chart-series`, the brand teal, for a series that is neither a stage nor an outcome — the weekly
  trend line, and breakdowns by source or work mode, whose categories are labelled on the bar rather
  than keyed to a colour.
- `--chart-neutral`, for marks that stand for an absence: the "not recorded" slice and the weekly
  goal's reference line. **It carries no chroma at all**, which is what keeps it clear of Withdrawn —
  that outcome is near-neutral by decision and the two share a chart.

### Measured, not asserted

Every value was solved against a contrast target. Measured ratios:

|                                  | light       | dark         |
| -------------------------------- | ----------- | ------------ |
| body text on page                | 17.57       | 17.57        |
| muted text on page               | 4.52        | 7.10         |
| primary on page                  | 4.94        | 8.52         |
| `--border-strong` on page        | 3.00        | 3.07         |
| card vs page                     | 1.05        | 1.22         |
| selected vs hover tint           | 1.37        | 1.32         |
| stage identity vs page           | 3.05 – 6.99 | 3.05 – 11.00 |
| outcome identity vs page         | 3.29 – 6.52 | 5.47 – 10.68 |
| chip text on chip surface        | 4.99 – 5.01 | 4.99 – 5.01  |
| chart marks vs page              | 3.48 – 4.94 | 3.34 – 8.52  |
| not-recorded vs Withdrawn        | 1.87        | 1.64         |
| tightest outcome pair, greyscale | 1.14        | 1.09         |

`e2e/tokens.spec.ts` asserts these floors in both themes, so a token edited to a nicer-looking
value that drops below one fails the build rather than shipping.

### Dark is the default; light is an opt-in

**The bare `:root` carries the dark values and light lives under `:root.light`.** Nothing consults
`prefers-color-scheme` — a visitor whose system asks for light still gets dark, because dark is the
ground this palette was drawn against and the brand's dark end is the page itself. The `dark`
variant follows the same key from the other side: it applies unless `.light` is set, so a `dark:`
utility is live by absence rather than by match.

**The class is server-rendered from a cookie**, read in the root layout. That is not a persistence
convenience, it is the only correct placement: a class applied after first paint means the page
paints dark and then changes, and every element carrying `transition-colors` animates through the
gap — measured here at roughly 150ms during which the navigation links sat below 4.5:1, caught by
the accessibility sweep at a different intermediate colour on each run.

An earlier version of this record held that a toggle would need "a blocking inline script to set the
class before first paint". It does not, and the reason is specific to this application: every page
renders per request already, because the Content-Security-Policy is nonce-based. The class costs one
cookie read and no script at all. **Nothing writes the cookie yet** — the settings screen is where
it gets a control, and the test suites seed it meanwhile so the light palette stays exercised rather
than becoming a set of values nothing can render.

A third "follow the system" choice stays available without reopening this: it would add the light
values under `@media (prefers-color-scheme: light)` scoped to a class of its own, leaving both
blocks here untouched.

### Density, and the target-size collision

The scale is the dashboard one, 8–32px. Tailwind derives every spacing utility from `--spacing`, so
the scale is continuous and the decision is which steps are in bounds: **2 3 4 5 6 8**. Anything
above `8` is the marketing scale.

The interesting part is a genuine conflict. A 44×44px touch target is WCAG 2.5.5, which is **AAA**;
the AA criterion is 2.5.8 at **24×24**. A 44px row is not a compact table, so on the densest screen
in the product the two pull in opposite directions.

**Resolution: the larger floor binds where the pointer is coarse.** `@media (pointer: coarse)`
raises the minimum interactive box to 44px and lifts the small and medium control heights to match;
fine pointers keep 32–36px controls with at least 8px between them, which clears 2.5.8 with room.

This is not machine-checkable. `axe-core`'s `target-size` rule is off unless the WCAG 2.2 ruleset is
requested by name, and even enabled it tests 24×24 — so the 44px floor depends on the manual
keyboard and pointer pass, not on the automated gate.

## Consequences

- A palette change is an edit to the semantic layer. No component holds a colour.
- The generated component library reads semantic tokens for free, since `:root` plus `@theme inline`
  is the shape it already expects.
- Two extra tokens per stage and outcome — 24 in total — in exchange for chips that are readable by
  construction rather than by inspection.
- Deleting the default palette means a generated component written against stock utilities renders
  unstyled. That is the intended signal, and it surfaces at review rather than in production.
- `--font-mono` is deliberately absent: there is no monospace anywhere in the product UI, and a
  token for it would be an invitation.
- The chart slots are down to two, and both are asserted by the token suite despite having no
  consumer yet — an unused token is exactly where a value drifts unnoticed.
- Light mode is reachable only by a cookie nothing writes, so until the settings screen ships it is
  the test suites that keep that half of the palette honest. The theme each suite rendered is
  asserted, because every contrast floor here holds in both and a lane that stopped switching would
  pass while checking dark twice.

## Alternatives considered

- **One categorical palette across all eight stages.** Rejected: it asserts an order among outcomes.
- **Keeping Tailwind's default palette and relying on review.** Rejected: the rule that every visual
  call lands as a token is only worth stating if something enforces it.
- **A saturated amber accent.** An earlier draft made `--accent` an amber a hair from the Ghosted
  outcome — about 3° of hue and 1.12:1 apart — and resolved the collision with a usage rule barring
  the accent from large fills next to an outcome chip. Replaced by a neutral hover tint, which means
  the collision cannot arise at all. Amber survives as Ghosted, where it carries meaning.
- **Following the system setting.** What this record originally decided, and overturned once the
  screens existed: the palette is drawn for a dark ground and half the visitors were being handed
  the other one by their operating system.
- **Dropping light entirely.** Rejected. It costs nothing to keep behind a class, the values are
  already solved, and deleting them means re-solving them the day somebody wants light.
- **Applying the theme class in the browser** — an inline script, or a class set on mount. Rejected
  on measurement rather than principle; see the transition finding above.
- **Five generic chart colours, re-solved for mutual separation.** Rejected: it makes a funnel bar a
  different colour from the stage chip on the same screen, and buys distinct colours for breakdown
  categories that are labelled directly anyway.
- **44px targets everywhere.** Rejected: it contradicts the dense table the product is built around,
  and it exceeds the AA criterion the client actually targets.

## Revision history

- **2026-08-08 — original.** Three enforced layers, a sequential stage scale beside a categorical
  outcome one, three tokens per stage and outcome, two border tokens, the dashboard density scale
  and the coarse-pointer resolution of the target-size conflict. Dark mode followed
  `prefers-color-scheme`; the five chart slots were declared provisional.
- **2026-08-21 — judged against real screens, which is what the checkpoint after the board was
  for.** Three changes, and the first two only became visible once there was something to look at.
  **Dark is now the default and wins over the system setting**, with light kept behind `.light` and
  selected by a cookie the root layout reads — and the placement of that read is the finding rather
  than a detail, because setting the class in the browser lands after first paint and every
  `transition-colors` in the tree then animates out of the wrong palette, which the accessibility
  sweep caught as failing contrast at a different intermediate colour each run. The original's claim
  that a toggle needs a blocking inline script was wrong for this application specifically: the
  nonce-based policy already makes every page render per request. **The selected tint and the hover
  tint stopped sharing a value** — `--secondary` and `--muted` were the same ramp step, so hovering
  an unselected filter was indistinguishable from selecting it, and the toggles on the applications
  list were where it showed. **The chart slots are settled** ahead of the analytics work that
  inherits them: five generic slots turned out to be the stage ramp and three outcome hues under
  other names, so domain marks read the domain tokens and two slots remain for a series the domain
  does not colour and for the marks that stand for an absence. The palette, the typeface, the
  density scale and the motion timings were all confirmed unchanged at the same sitting.
