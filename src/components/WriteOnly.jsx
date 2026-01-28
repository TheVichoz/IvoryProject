import { useRole } from '@/hooks/useRole';
export default function WriteOnly({ children }) {
  const { loading, canWrite } = useRole();
  if (loading || !canWrite) return null;
  return <>{children}</>;
}
