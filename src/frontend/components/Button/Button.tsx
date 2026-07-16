import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export default function Button({ variant = 'primary', size = 'md', loading, children, className, ...rest }: ButtonProps) {
  return (
    <button className={`${styles.button} ${styles[variant]} ${styles[size]} ${className || ''}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? '...' : children}
    </button>
  );
}
