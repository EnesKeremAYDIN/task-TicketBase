import styles from './Loading.module.css';

interface LoadingProps { text?: string; }

export default function Loading({ text = 'Yükleniyor...' }: LoadingProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.spinner} />
      <p className={styles.text}>{text}</p>
    </div>
  );
}
