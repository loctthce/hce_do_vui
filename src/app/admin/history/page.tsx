import { AdminHistoryDashboard } from '@/components/admin-history-dashboard';
import { AdminAuthGate } from '@/components/admin-auth-gate';

export default function AdminHistoryPage() {
  return (
    <AdminAuthGate>
      <AdminHistoryDashboard />
    </AdminAuthGate>
  );
}
