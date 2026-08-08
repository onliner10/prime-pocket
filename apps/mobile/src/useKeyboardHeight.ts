import { useEffect, useState } from "react";
import { Keyboard, Platform, type KeyboardEvent } from "react-native";

/**
 * Live keyboard height for lifting absolute docks above the IME.
 *
 * iOS: the window does not shrink, so docks must move by this amount.
 * Web: use visualViewport to measure how much of the layout viewport the
 * soft keyboard covers (RN Keyboard events are unreliable in browsers).
 * Android (Expo default `resize`): the window already shrinks with the IME, so
 * callers should ignore this height to avoid double-offsetting.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === "android") return;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const viewport = window.visualViewport;
      if (!viewport) return;

      const update = () => {
        // URL-bar collapses also shrink visualViewport; ignore small deltas.
        const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        setHeight(covered > 80 ? Math.round(covered) : 0);
      };

      update();
      viewport.addEventListener("resize", update);
      viewport.addEventListener("scroll", update);
      return () => {
        viewport.removeEventListener("resize", update);
        viewport.removeEventListener("scroll", update);
      };
    }

    const showEvent = "keyboardWillShow";
    const hideEvent = "keyboardWillHide";

    const onShow = (event: KeyboardEvent) => {
      setHeight(event.endCoordinates?.height ?? 0);
    };
    const onHide = () => setHeight(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

/** Bottom offset for a floating composer: above the keyboard when open, else resting inset. */
export function composerDockBottom(restingBottom: number, keyboardHeight: number, gap = 8): number {
  if (keyboardHeight > 0) return keyboardHeight + gap;
  return restingBottom;
}
