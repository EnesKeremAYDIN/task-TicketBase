import styles from './Badge.module.css';

interface BadgeProps {
  variant: string;
  children: React.ReactNode;
}

export default function Badge({ variant, children }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[variant] || ''}`}>{children}</span>;
}
