/**
 * Named-reason pause set.
 *
 * A Set, not a boolean and not a refcount. The case that decides it: the player
 * alt-tabs while the end-of-day summary is up. A boolean resumes the clock behind
 * a still-visible modal; a counter does the same one release early. A named set
 * releases 'awayFromDesk' and 'summary' still holds.
 */

export type PauseReason =
  | 'boot' // held through OfficeScene.create()
  | 'summary' // MODAL
  | 'minigame' // MODAL — M3
  | 'awayFromDesk' // non-modal: the tab is hidden or the window lost focus
  | 'dayTransition' // non-modal: Office must run to perform the morning reset
  | 'dialogue'; // non-modal — M4's in-scene overlay

/** Reasons that additionally pause OfficeScene itself. */
export const MODAL_REASONS: ReadonlySet<PauseReason> = new Set<PauseReason>(['summary', 'minigame']);

export class PauseStack {
  private readonly held = new Set<PauseReason>();
  private cachedDescription = '';
  private cachedSize = -1;

  /** True only on the running -> held transition. */
  hold(reason: PauseReason): boolean {
    if (this.held.has(reason)) return false;
    const wasRunning = this.held.size === 0;
    this.held.add(reason);
    return wasRunning;
  }

  /** True only on the held -> running transition. */
  release(reason: PauseReason): boolean {
    if (!this.held.delete(reason)) return false;
    return this.held.size === 0;
  }

  has(reason: PauseReason): boolean {
    return this.held.has(reason);
  }

  get running(): boolean {
    return this.held.size === 0;
  }

  /** Any held reason that should also pause the scene. */
  get modal(): boolean {
    for (const reason of this.held) {
      if (MODAL_REASONS.has(reason)) return true;
    }
    return false;
  }

  /**
   * For the ?debug=1 readout: a system that forgets to release names itself on
   * screen. Cached, because the readout asks repeatedly and this allocates.
   */
  describe(): string {
    if (this.held.size !== this.cachedSize) {
      this.cachedSize = this.held.size;
      this.cachedDescription = this.held.size === 0 ? 'running' : Array.from(this.held).join('+');
    }
    return this.cachedDescription;
  }
}
