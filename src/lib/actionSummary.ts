// Turn a tool name + raw JSON args into a short, human-readable action, used in
// the confirmation prompt and the tool trail. Pure and unit-tested.

export function actionSummary(tool: string, rawArgs: string): string {
  let a: Record<string, unknown> = {};
  try {
    a = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    /* fall through to the generic form */
  }
  switch (tool) {
    case 'open_url':
      return `Open ${a.url ?? '(a new tab)'}`;
    case 'navigate_to':
      return `Go to ${a.url ?? '(a URL)'}`;
    case 'click_element':
      return `Click element #${a.index ?? '?'}`;
    case 'type_text': {
      const text = String(a.text ?? '');
      const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text;
      return `Type “${preview}” into element #${a.index ?? '?'}`;
    }
    case 'scroll_page':
      return `Scroll ${a.direction ?? 'down'}`;
    default:
      return rawArgs && rawArgs !== '{}' ? `${tool} ${rawArgs}` : tool;
  }
}
