import Badge from '../Badge/Badge';
import { Priority, PRIORITY_LABELS } from '../../lib/types';

interface Props { priority: Priority; }

export default function PriorityBadge({ priority }: Props) {
  return <Badge variant={priority}>{PRIORITY_LABELS[priority] || priority}</Badge>;
}
