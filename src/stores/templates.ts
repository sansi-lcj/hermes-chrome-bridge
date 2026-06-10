import { create } from 'zustand';
import { loadTemplates, newTemplateId, saveTemplates, type PromptTemplate } from '../lib/templates';

interface TemplatesState {
  templates: PromptTemplate[];
  loaded: boolean;
  load: () => Promise<void>;
  addTemplate: (t: Omit<PromptTemplate, 'id'>) => Promise<void>;
  updateTemplate: (id: string, patch: Partial<Omit<PromptTemplate, 'id'>>) => Promise<void>;
  removeTemplate: (id: string) => Promise<void>;
}

/** Holds the user's prompt templates (quick commands), persisted to storage. */
export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],
  loaded: false,

  load: async () => {
    set({ templates: await loadTemplates(), loaded: true });
  },
  addTemplate: async (t) => {
    const templates = [...get().templates, { id: newTemplateId(), ...t }];
    set({ templates });
    await saveTemplates(templates);
  },
  updateTemplate: async (id, patch) => {
    const templates = get().templates.map((t) => (t.id === id ? { ...t, ...patch } : t));
    set({ templates });
    await saveTemplates(templates);
  },
  removeTemplate: async (id) => {
    const templates = get().templates.filter((t) => t.id !== id);
    set({ templates });
    await saveTemplates(templates);
  },
}));
