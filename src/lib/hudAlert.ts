/** Shared between LiveRail (raises) and NeuralHud (draws): the red alert state. */
export type HudAlert = { text: string; until: number }

let alertState: HudAlert = { text: '', until: 0 }

/** Raise the red alert look for `ms` milliseconds. */
export function raiseHudAlert(text: string, ms = 8000): void {
  alertState = { text, until: performance.now() + ms }
}

export function currentHudAlert(): HudAlert {
  return alertState
}
