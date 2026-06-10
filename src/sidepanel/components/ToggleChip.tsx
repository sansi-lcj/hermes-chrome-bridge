import type { ReactNode } from 'react';
import { Tooltip } from 'antd';

interface ToggleChipProps {
  label: string;
  /** Accessible name (defaults to label) — kept stable for tests. */
  ariaLabel?: string;
  icon?: ReactNode;
  active: boolean;
  onChange: (active: boolean) => void;
  tooltip?: string;
}

/** A compact, accessible pill toggle (role=switch) for composer options. */
export function ToggleChip({ label, ariaLabel, icon, active, onChange, tooltip }: ToggleChipProps) {
  const chip = (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel ?? label}
      className={active ? 'chip chip-on' : 'chip'}
      onClick={() => onChange(!active)}
    >
      {icon && <span className="chip-icon">{icon}</span>}
      {label}
    </button>
  );
  return tooltip ? (
    <Tooltip title={tooltip} mouseEnterDelay={0.4}>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}
