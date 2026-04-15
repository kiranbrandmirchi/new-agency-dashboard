import { useAuth } from '../context/AuthContext';

/**
 * Renders children only if the user has the specified permission.
 * Otherwise renders nothing.
 */
export function PermissionGate({ permission, children }) {
  const { hasPermission } = useAuth();
  if (!permission) return children;
  return hasPermission(permission) ? children : null;
}
