import { makeAutoObservable, runInAction } from 'mobx';
import { sendRuntime } from '../lib/messaging';
import type { SessionInfo, Skill, Toolset } from '../lib/types';

/** Loads and holds the agent's skills/toolsets and prior sessions. */
export class CatalogStore {
  skills: Skill[] = [];
  toolsets: Toolset[] = [];
  skillsLoading = false;
  skillsLoaded = false;
  skillsError: string | null = null;

  sessions: SessionInfo[] = [];
  sessionsLoading = false;
  sessionsLoaded = false;
  sessionsError: string | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  async loadSkills() {
    this.skillsLoading = true;
    this.skillsError = null;
    try {
      const [skills, toolsets] = await Promise.all([
        sendRuntime<Skill[]>({ type: 'api', action: 'skills' }).catch(() => [] as Skill[]),
        sendRuntime<Toolset[]>({ type: 'api', action: 'toolsets' }),
      ]);
      runInAction(() => {
        this.skills = skills;
        this.toolsets = toolsets;
        this.skillsLoaded = true;
      });
    } catch (e) {
      runInAction(() => {
        this.skillsError = String(e);
      });
    } finally {
      runInAction(() => {
        this.skillsLoading = false;
      });
    }
  }

  async loadSessions() {
    this.sessionsLoading = true;
    this.sessionsError = null;
    try {
      const sessions = await sendRuntime<SessionInfo[]>({ type: 'api', action: 'sessions' });
      runInAction(() => {
        this.sessions = sessions;
        this.sessionsLoaded = true;
      });
    } catch (e) {
      runInAction(() => {
        this.sessionsError = String(e);
      });
    } finally {
      runInAction(() => {
        this.sessionsLoading = false;
      });
    }
  }
}
