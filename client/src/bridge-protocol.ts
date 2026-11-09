export interface Anchor {
  selector: string;
  text: string;
  url?: string;
  /** Wizard step id/label captured from a stepper, if any. */
  step?: string;
  /** View-state key this anchor was captured in (empty means "any state"). */
  state?: string;
  /** How the state key was produced: 'declarative' | 'auto'. */
  stateMode?: string;
  x: number;
  y: number;
}

export interface Pin {
  id: string;
  selector: string;
  x: number;
  y: number;
  status: 'open' | 'resolved';
  index: number;
  /** Design URL (page) this pin belongs to; empty means "any page". */
  url: string;
  /** Wizard step id/label this pin lives on, if any. */
  step?: string;
  /** View-state key this pin lives in; empty means "any state". */
  state?: string;
}

/** One declarative, state-bearing control for a known prototype. */
export interface StateControl {
  key: string;
  selector: string;
  /** Value extractor: 'text' | 'value' | 'checked' | 'id' | 'wizard-step' | 'attr:<name>'. */
  value: string;
  activate?: 'click';
}

/** How to leave a subview (e.g. go back from a detail view to its list). */
export interface RevealClose {
  /** Optional global function name to call (with `args`) to leave the subview. */
  call?: string;
  /** Arguments passed to `call`. */
  args?: unknown[];
  /** CSS selector of a "back" element to click when no `call` is available. */
  selector?: string;
}

/**
 * A declarative view-replay rule: how to reach (or leave) a recorded control
 * value. Matches a `StateControl.key`; when that control's recorded value
 * differs from the current page value, the bridge calls `call` (a global
 * function) or clicks the first opener element whose `value` matches the
 * recorded value. When the control is absent from the recorded state but
 * currently open, the bridge applies `close` instead.
 */
export interface RevealControl {
  /** Matches a StateControl.key. */
  key: string;
  /** CSS selector for candidate opener elements (used when no `call`). */
  selector?: string;
  /** How to read an opener's target value: 'text' (default) | 'value' | 'checked' | 'id' | 'attr:<name>'. */
  value?: string;
  /** 'click' (default) matches openers by `value`; 'open' clicks a single opener / calls `call`. */
  action?: string;
  /** Optional global opener function name to call with the recorded value. */
  call?: string;
  /** Arguments passed to `call` (used with action 'open'). */
  args?: unknown[];
  /**
   * When the control's candidate elements are entirely missing (they live in
   * a subview that isn't open yet), open that subview first — via `call` or
   * by clicking `selector` — and retry the match on the next view loop.
   */
  open?: RevealClose;
  /** How to leave this subview when the comment was recorded elsewhere. */
  close?: RevealClose;
}

/** Persona-level declarative state config, sent to the bridge. */
export interface StateConfig {
  controls: StateControl[];
  reveal?: RevealControl[];
}

// Messages sent from the parent React app to the bridge inside the iframe.
export type ParentMessage =
  | { source: 'uxer'; type: 'mode'; mode: 'browse' | 'comment' }
  | { source: 'uxer'; type: 'config'; state: StateConfig | null }
  | { source: 'uxer'; type: 'pins'; pins: Pin[] }
  | {
      source: 'uxer';
      type: 'focus';
      selector: string;
      step?: string;
      state?: string;
      persist?: boolean;
      id?: string;
      text?: string;
    }
  | {
      source: 'uxer';
      type: 'navigate';
      url: string;
      selector: string;
      step?: string;
      state?: string;
      persist?: boolean;
      id?: string;
      text?: string;
    }
  | { source: 'uxer'; type: 'clear' };

// Messages emitted by the bridge to the parent.
export type BridgeMessage =
  | { source: 'uxer-bridge'; type: 'ready'; url: string }
  | { source: 'uxer-bridge'; type: 'anchor'; anchor: Anchor }
  | { source: 'uxer-bridge'; type: 'location'; url: string }
  | { source: 'uxer-bridge'; type: 'pin-click'; id: string }
  | {
      source: 'uxer-bridge';
      type: 'step-blocked';
      id?: string;
      selector: string;
      step?: string;
      stepLabel?: string;
      reason?: string;
    }
  | {
      source: 'uxer-bridge';
      type: 'step-reached';
      id?: string;
    };

export function sendToBridge(win: Window | null, msg: ParentMessage) {
  // The preview runs on a persona origin (a subdomain of ours), so target it
  // explicitly rather than assuming same-origin.
  win?.postMessage(msg, '*');
}
