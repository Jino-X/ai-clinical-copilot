import Link from "next/link";

/**
 * Layout for authentication pages (login, signup, reset, verify).
 *
 * Centered card on a muted background. No navigation — the user is not
 * authenticated yet, so there is nothing to navigate to.
 */
export default function AuthLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 p-6">
      <Link
        href="/"
        className="flex items-center gap-2 text-lg font-semibold tracking-tight"
      >
        <span className="inline-block size-2 rounded-full bg-primary" aria-hidden />
        AI Clinical Copilot
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
