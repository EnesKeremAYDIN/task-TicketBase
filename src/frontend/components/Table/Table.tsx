import styles from './Table.module.css';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
}

export default function Table<T extends Record<string, unknown>>({ columns, data, onRowClick }: TableProps<T>) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {columns.map((col) => <th key={col.key} className={styles.th}>{col.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={String(row.id || i)} className={`${onRowClick ? styles.clickable : ''}`} onClick={() => onRowClick?.(row)}>
            {columns.map((col) => (
              <td key={col.key} className={styles.td}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
