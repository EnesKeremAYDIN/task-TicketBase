import Button from '../Button/Button';
import styles from './ErrorBanner.module.css';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className={styles.banner} role="alert">
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Tekrar Dene
        </Button>
      )}
    </div>
  );
}
