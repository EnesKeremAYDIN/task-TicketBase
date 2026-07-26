import { useId } from 'react';
import styles from './Select.module.css';

interface Option { value: string; label: string; }

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Option[];
}

export default function Select({ label, options, className, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = rest.id || generatedId;
  return (
    <div className={styles.wrapper}>
      {label && <label className={styles.label} htmlFor={selectId}>{label}</label>}
      <select id={selectId} className={`${styles.select} ${className || ''}`} {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
