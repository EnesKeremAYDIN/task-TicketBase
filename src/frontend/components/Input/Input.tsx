import { useId } from 'react';
import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = rest.id || generatedId;
  return (
    <div className={styles.wrapper}>
      {label && <label className={styles.label} htmlFor={inputId}>{label}</label>}
      <input id={inputId} className={`${styles.input} ${error ? styles.error : ''} ${className || ''}`} {...rest} />
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
