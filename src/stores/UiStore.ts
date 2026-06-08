import { makeAutoObservable } from 'mobx';

export type Tab = 'chat' | 'skills' | 'sessions' | 'settings';

/** Which top-level view is active. */
export class UiStore {
  tab: Tab = 'chat';

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setTab(tab: Tab) {
    this.tab = tab;
  }
}
