// Hand-written declarations for the shared mock server (plain .mjs so the dev
// CLI can run it with bare `node`, no TS toolchain required).

import type http from 'node:http';

export declare const MOCK: {
  CHAT_DELTAS: string[];
  TOOLS_DONE: string;
  RUN_DELTAS: string[];
  MODELS: Array<{ id: string }>;
  SKILLS: Array<{ name: string; description: string }>;
  TOOLSETS: Array<{ name: string; tools: string[] }>;
  SESSIONS: Array<{ id: string; title: string; updated_at: number }>;
};

export declare function createMockHermes(options?: {
  cors?: boolean;
  log?: (line: string) => void;
}): http.Server;
