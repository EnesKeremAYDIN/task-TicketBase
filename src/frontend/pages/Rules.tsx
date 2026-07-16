import { useState, useEffect } from 'react';
import { getRules } from '../lib/api';
import Card from '../components/Card/Card';
import Loading from '../components/Loading/Loading';

interface Rule { kural: string; deger: string; }

function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);

  useEffect(() => {
    getRules().then((data) => setRules(data.rules));
  }, []);

  if (rules.length === 0) return <Loading />;

  return (
    <div>
      <h2 style={{ fontSize: '1.3rem', marginBottom: 16 }}>İşletim Kuralları</h2>
      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Kural</th>
              <th>Değer</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i}>
                <td>{r.kural}</td>
                <td><strong>{r.deger}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default Rules;
