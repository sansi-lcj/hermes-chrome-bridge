import { Button, Space, Tooltip } from 'antd';
import { AudioOutlined, CameraOutlined, CloseCircleFilled } from '@ant-design/icons';
import { Sender } from '@ant-design/x';
import { useShallow } from 'zustand/react/shallow';
import { feedback } from '../../lib/feedback';
import { matchTemplates } from '../../lib/templates';
import { speechSupported } from '../../lib/speech';
import { useChatStore, useTemplatesStore } from '../../stores';

/** Whether the input is still typing a slash-command name (no space yet). */
const COMMAND_RE = /^\/\S*$/;

/** The composer: Sender + a "/" quick-command menu + voice + screenshot. */
export function Composer() {
  const s = useChatStore(
    useShallow((c) => ({
      input: c.input,
      streaming: c.streaming,
      recording: c.recording,
      attachedImages: c.attachedImages,
      setInput: c.setInput,
      sendMessage: c.sendMessage,
      stop: c.stop,
      applyTemplate: c.applyTemplate,
      toggleVoice: c.toggleVoice,
      captureScreenshot: c.captureScreenshot,
      removeAttachment: c.removeAttachment,
    })),
  );
  const templates = useTemplatesStore((t) => t.templates);

  const showCommands = COMMAND_RE.test(s.input);
  const matches = showCommands ? matchTemplates(templates, s.input) : [];

  const capture = () => void s.captureScreenshot().catch((err) => feedback.error(String(err)));

  const prefix = (
    <Space size={2}>
      {speechSupported() && (
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
      )}
      <Tooltip title="Attach a screenshot of the page">
        <Button
          type="text"
          shape="circle"
          icon={<CameraOutlined />}
          aria-label="Attach screenshot"
          onClick={capture}
        />
      </Tooltip>
    </Space>
  );

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
      {s.attachedImages.length > 0 && (
        <div className="attachments" aria-label="Attachments">
          {s.attachedImages.map((src, i) => (
            <div key={i} className="attachment">
              <img src={src} alt={`Attachment ${i + 1}`} />
              <button
                type="button"
                className="attachment-remove"
                aria-label={`Remove attachment ${i + 1}`}
                onClick={() => s.removeAttachment(i)}
              >
                <CloseCircleFilled />
              </button>
            </div>
          ))}
        </div>
      )}
      <Sender
        value={s.input}
        loading={s.streaming}
        onChange={s.setInput}
        onSubmit={s.sendMessage}
        onCancel={s.stop}
        prefix={prefix}
        placeholder="Message the agent…  (/ for commands, Shift+Enter for newline)"
      />
    </div>
  );
}
