/**
 * Who may open /admin. ADMIN_EMAILS is a comma-separated list of the
 * operator's Google addresses; unset means nobody, so a deployment that never
 * configured it exposes no cross-user view at all.
 *
 * Kept apart from src/lib/admin.ts so auth.ts can import it without pulling
 * the overview queries into every request.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
