import type { EventCursor } from "./types.js";

export function compareCursor(a: EventCursor, b: EventCursor): number {
  if (a.generation !== b.generation) return a.generation - b.generation;
  return a.sequence - b.sequence;
}

export function isCursorAfter(a: EventCursor, b: EventCursor): boolean {
  return compareCursor(a, b) > 0;
}

export function nextCursor(prev: EventCursor): EventCursor {
  return { generation: prev.generation, sequence: prev.sequence + 1 };
}

export function bumpGeneration(prev: EventCursor): EventCursor {
  return { generation: prev.generation + 1, sequence: 0 };
}

export function initialCursor(): EventCursor {
  return { generation: 1, sequence: 0 };
}
