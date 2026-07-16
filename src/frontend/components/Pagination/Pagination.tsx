import Button from '../Button/Button';
import Select from '../Select/Select';
import styles from './Pagination.module.css';

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

export default function Pagination({ page, total, limit, onChange, onLimitChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  if (totalPages <= 1) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.info}>
          {total > 0 ? `${from}-${to} / ${total} kayıt` : '0 kayıt'}
        </div>
        <div className={styles.controls}>
          <Select
            value={String(limit)}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            options={[
              { value: '10', label: '10' },
              { value: '20', label: '20' },
              { value: '50', label: '50' },
              { value: '100', label: '100' },
            ]}
          />
          <span className={styles.perPage}>kayıt/sayfa</span>
        </div>
      </div>
    );
  }

  const pageNumbers: (number | string)[] = [];
  const range = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - range && i <= page + range)) {
      pageNumbers.push(i);
    } else if (pageNumbers[pageNumbers.length - 1] !== '...') {
      pageNumbers.push('...');
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.info}>
        {from}-{to} / {total} kayıt — Sayfa {page}/{totalPages}
      </div>
      <div className={styles.controls}>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(1)} title="İlk Sayfa">
          «
        </Button>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} title="Önceki Sayfa">
          ‹
        </Button>
        {pageNumbers.map((p, i) =>
          typeof p === 'number' ? (
            <Button
              key={i}
              variant={p === page ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onChange(p)}
            >
              {p}
            </Button>
          ) : (
            <span key={i} className={styles.ellipsis}>…</span>
          ),
        )}
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)} title="Sonraki Sayfa">
          ›
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(totalPages)} title="Son Sayfa">
          »
        </Button>
        <div className={styles.separator} />
        <Select
          value={String(limit)}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          options={[
            { value: '10', label: '10' },
            { value: '20', label: '20' },
            { value: '50', label: '50' },
            { value: '100', label: '100' },
          ]}
        />
        <span className={styles.perPage}>kayıt/sayfa</span>
      </div>
    </div>
  );
}
