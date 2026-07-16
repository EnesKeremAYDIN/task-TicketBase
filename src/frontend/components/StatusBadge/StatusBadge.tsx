import Badge from '../Badge/Badge';
import { Status, STATUS_LABELS } from '../../lib/types';

interface Props { status: Status; }

export default function StatusBadge({ status }: Props) {
  return <Badge variant={status}>{STATUS_LABELS[status] || status}</Badge>;
}
