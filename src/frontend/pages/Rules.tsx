import { useState, useEffect } from 'react';
import { getRules } from '../lib/api';

function Rules() {
  const [rules, setRules] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    getRules().then((data) => setRules(data.rules));
  }, []);

  return (
    <div>
      <h2>İşletim Kuralları</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th>Kural</th>
            <th>Değer</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
              <td>{r.kural}</td>
              <td><strong>{r.deger}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Rules;
