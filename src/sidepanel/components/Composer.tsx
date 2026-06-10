import { Button, Tooltip } from 'antd';
import { AudioOutlined } from '@ant-design/icons';
import { Sender } from '@ant-design/x';
import { useShallow } from 'zustand/react/shallow';
import { matchTemplates } from '../../lib/templates';
import { speechSupported } from '../../lib/speech';
import { useChatStore, useTemplatesStore } from '../../stores';

/** Whether the input is still typing a slash-command name (no space yet). */
const COMMAND_RE = /^\/\S*$/;

/** The composer: Sender + a "/" quick-command menu + voice dictation. */
export function Composer() {
  const s = useChatStore(
    useShallow((c) => ({
      input: c.input,
      streaming: c.streaming,
      recording: c.recording,
      setInput: c.setInput,
      sendMessage: c.sendMessage,
      stop: c.stop,
      applyTemplate: c.applyTemplate,
      toggleVoice: c.toggleVoice,
    })),
  );
  const templates = useTemplatesStore((t) => t.templates);

  const showCommands = COMMAND_RE.test(s.input);
  const matches = showCommands ? matchTemplates(templates, s.input) : [];

  const voice = speechSupported() ? (
    <Tooltip title={s.recording ? 'Stop dictation' : 'Voice input'}>
      <Button
        type="text"
        shape="circle"
        icon={<AudioOutlined />}
        aria-label={s.recording ? 'Stop voice input' : 'Voice input'}
        className={s.recording ? 'mic recording' : 'mic'}
        onClick={s.toggleVoice}
      />
    </Tooltip>
  ) : null;

  return (
    <div className="composer">
      {matches.length > 0 && (
        <div className="cmd-menu" role="listbox" aria-label="Quick commands">
          {matches.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={false}
              className="cmd-item"
              onClick={() => void s.applyTemplate(t)}
            >
              <span className="cmd-name">/{t.name}</span>
              <span className="cmd-desc">{t.description}</span>
            </button>
          ))}
        </div>
      )}
      <Sender
        value={s.input}
        loading={s.streaming}
        onChange={s.setInput}
        onSubmit={s.sendMessage}
        onCancel={s.stop}
        prefix={voice}
        placeholder="Message the agent…  (/ for commands, Shift+Enter for newline)"
      />
    </div>
  );
}
