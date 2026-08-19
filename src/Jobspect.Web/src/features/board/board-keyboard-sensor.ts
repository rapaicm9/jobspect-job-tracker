import { KeyboardSensor } from "@dnd-kit/dom";

import { nextTargetInDirection, type Direction, type TargetRect } from "./keyboard";

/**
 * The keyboard drag, moving between targets rather than by pixels.
 *
 * dnd-kit's own `KeyboardSensor` nudges the drag by a fixed offset - ten pixels
 * per arrow press, fifty with shift held - which is the right default for a
 * sortable list of rows and no use at all on a board four columns wide. Crossing
 * this one takes sixty-odd presses.
 *
 * So `handleMove` is the only thing overridden. Lifting, dropping, cancelling and
 * suspending the auto-scroller are all inherited, and the activation constraint
 * that requires the press to have landed on the grip comes with them.
 */
export class BoardKeyboardSensor extends KeyboardSensor {
  handleMove(direction: Direction, event: KeyboardEvent) {
    const { dragOperation, registry, actions } = this.manager;
    const { source, position } = dragOperation;

    const from = position.current;
    if (!source || !from) return;

    // A droppable's shape is computed only while it accepts the current source,
    // so the ones carrying a shape are exactly the legal targets. The move rules
    // are stated once, in `drag.ts`, and this reads their consequence rather than
    // a second copy of them - an earlier column simply is not in this list.
    const candidates: TargetRect[] = [];
    const elements = new Map<string, Element>();

    for (const droppable of registry.droppables.value) {
      const { shape, element } = droppable;
      if (droppable.disabled || !shape || !element || !droppable.accepts(source)) continue;

      const id = String(droppable.id);
      const { left, right, top, bottom } = shape.boundingRectangle;

      candidates.push({ id, left, right, top, bottom, centre: shape.center });
      elements.set(id, element);
    }

    const next = nextTargetInDirection(from, candidates, direction);
    if (next === null) return;

    event.preventDefault();

    // Scrolled into view before the coordinates are read, not after. The sensor
    // suspends the auto-scroller for the whole of a keyboard drag, and below `lg`
    // the board scrolls sideways - so without this a card moves to a column that
    // is off the right edge and the screen never follows it.
    const element = elements.get(next.id);
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });

    const rect = element?.getBoundingClientRect();
    const to =
      rect === undefined
        ? next.centre
        : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    actions.move({ event, to });
  }
}

/**
 * Registered as a descriptor rather than through `configure`, which is a trap
 * here.
 *
 * `Sensor.configure` is a static built by `configurator(KeyboardSensor)`, and
 * that closes over the class it was made for. A subclass inherits the static but
 * not the closure, so `BoardKeyboardSensor.configure({⬦})` registers the **base**
 * sensor - quietly, with the override above gone and the pixel nudging back.
 */
export const boardKeyboardSensor = {
  plugin: BoardKeyboardSensor,
  options: {
    keyboardCodes: {
      start: ["Space", "Enter"],
      // Tab is deliberately not here. dnd-kit's default ends the drag on it,
      // which means tabbing away from a lifted card commits a pipeline
      // transition - and tab is the key people press to leave something alone.
      end: ["Space", "Enter"],
      cancel: ["Escape", "Tab"],
      up: ["ArrowUp"],
      down: ["ArrowDown"],
      left: ["ArrowLeft"],
      right: ["ArrowRight"],
    },
  },
};
