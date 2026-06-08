import { makeAutoObservable, reaction } from 'mobx';
import { message } from 'antd';
import { sendRuntime } from '../lib/messaging';
import { originPattern } from '../lib/url';
import type { ChatMode, ModelInfo } from '../lib/types';
import type { SettingsStore } from './SettingsStore';

/** Editable draft of the settings form, persisted only on Save/Test. */
export class SettingsFormStore {
  baseUrl = '';
  apiKey = '';
  defaultModel = '';
  mode: ChatMode = 'chat';
  busy = false;

  constructor(private settings: SettingsStore) {
    makeAutoObservable(this, {}, { autoBind: true });
    // Seed the draft once the persisted settings have loaded.
    reaction(
      () => settings.loaded,
      (loaded) => loaded && this.reset(),
      { fireImmediately: true },
    );
  }

  reset() {
    const v = this.settings.values;
    this.baseUrl = v.baseUrl;
    this.apiKey = v.apiKey;
    this.defaultModel = v.defaultModel;
    this.mode = v.mode;
  }

  setBaseUrl(v: string) {
    this.baseUrl = v;
  }
  setApiKey(v: string) {
    this.apiKey = v;
  }
  setDefaultModel(v: string) {
    this.defaultModel = v;
  }
  setMode(v: ChatMode) {
    this.mode = v;
  }
  private setBusy(v: boolean) {
    this.busy = v;
  }

  /** Request the host permission and persist; returns false if it can't. */
  private async persist(): Promise<boolean> {
    const origin = originPattern(this.baseUrl);
    if (!origin) {
      message.error('Enter a valid http(s) URL.');
      return false;
    }
    const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
    if (!granted) {
      message.warning(`Host permission for ${origin} was not granted; requests will fail.`);
      return false;
    }
    await this.settings.save({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      defaultModel: this.defaultModel,
      mode: this.mode,
    });
    return true;
  }

  async save() {
    this.setBusy(true);
    try {
      if (await this.persist()) message.success('Saved.');
    } finally {
      this.setBusy(false);
    }
  }

  async test() {
    this.setBusy(true);
    try {
      if (!(await this.persist())) return;
      const data = await sendRuntime<{ models: ModelInfo[] }>({
        type: 'api',
        action: 'testConnection',
      });
      const names = data.models?.map((m) => m.id).join(', ') || 'none';
      message.success(`Connected. Models: ${names}`);
    } catch (err) {
      message.error(String(err));
    } finally {
      this.setBusy(false);
    }
  }
}
