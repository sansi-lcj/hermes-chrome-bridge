// User-facing toasts for non-component code (the Zustand stores). antd's
// static `message` API cannot consume the <App>/ConfigProvider context (theme
// tokens are lost and antd warns), so the panel registers the context-aware
// message instance from App.useApp() at mount, and stores call through this
// indirection.

export interface Feedback {
  success(content: string): void;
  error(content: string): void;
  warning(content: string): void;
}

let impl: Feedback = { success() {}, error() {}, warning() {} };

/** Called once by the panel with antd's context-aware message instance. */
export function registerFeedback(f: Feedback): void {
  impl = f;
}

export const feedback: Feedback = {
  success: (content) => impl.success(content),
  error: (content) => impl.error(content),
  warning: (content) => impl.warning(content),
};
