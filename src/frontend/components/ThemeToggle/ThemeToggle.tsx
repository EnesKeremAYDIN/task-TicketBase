import type { ThemePreference } from '../../lib/theme';
import styles from './ThemeToggle.module.css';

interface ThemeToggleProps {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
  compact?: boolean;
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Sistem' },
  { value: 'light', label: 'Açık' },
  { value: 'dark', label: 'Koyu' },
];

export default function ThemeToggle({ value, onChange, compact = false }: ThemeToggleProps) {
  return (
    <label className={`${styles.wrapper} ${compact ? styles.compact : ''}`}>
      <span className={styles.label}>Tema</span>
      <select
        className={styles.select}
        aria-label="Renk teması"
        value={value}
        onChange={(event) => onChange(event.target.value as ThemePreference)}
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
