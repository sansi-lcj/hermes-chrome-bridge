import { makeAutoObservable, runInAction } from 'mobx';
import { getSettings, onSettingsChanged, setSettings } from '../lib/storage';
import { DEFAULT_SETTINGS, type ChatMode, type Settings } from '../lib/types';

/** Observable mirror of the persisted settings (chrome.storage.local). */
export class SettingsStore {
  baseUrl = DEFAULT_SETTINGS.baseUrl;
  apiKey = DEFAULT_SETTINGS.apiKey;
  defaultModel = DEFAULT_SETTINGS.defaultModel;
  mode: ChatMode = DEFAULT_SETTINGS.mode;
  loaded = false;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
    void this.load();
    onSettingsChanged((s) => this.apply(s));
  }

  private apply(s: Settings) {
    this.baseUrl = s.baseUrl;
    this.apiKey = s.apiKey;
    this.defaultModel = s.defaultModel;
    this.mode = s.mode;
  }

  get values(): Settings {
    return {
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      defaultModel: this.defaultModel,
      mode: this.mode,
    };
  }

  get configured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async load() {
    const s = await getSettings();
    runInAction(() => {
      this.apply(s);
      this.loaded = true;
    });
  }

  async save(patch: Partial<Settings>): Promise<Settings> {
    const next = await setSettings(patch);
    runInAction(() => this.apply(next));
    return next;
  }
}
