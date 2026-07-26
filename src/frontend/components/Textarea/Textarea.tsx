import { useId } from 'react';
import styles from './Textarea.module.css';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export default function Textarea({ label, className, ...rest }: TextareaProps) {
  const generatedId = useId();
  const textareaId = rest.id || generatedId;
  return (
    <div className={styles.wrapper}>
      {label && <label className={styles.label} htmlFor={textareaId}>{label}</label>}
      <textarea id={textareaId} className={`${styles.textarea} ${className || ''}`} {...rest} />
    </div>
  );
}
