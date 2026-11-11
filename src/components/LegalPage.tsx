import Link from "next/link";

/** Where questions go: LUMI_CONTACT_EMAIL when set, the issue tracker otherwise. */
export function contact(): { href: string; label: string } {
  const email = process.env.LUMI_CONTACT_EMAIL?.trim();
  return email
    ? { href: `mailto:${email}`, label: email }
    : { href: "https://github.com/anniehyd/Lumi/issues", label: "github.com/anniehyd/Lumi/issues" };
}

/**
 * The frame for the two plain-language pages a public sign-in needs: privacy
 * and terms. Server-rendered, no session, readable signed out — Google's
 * consent screen links straight to them.
 */
export function LegalPage({
  title,
  updated,
  lede,
  children,
}: {
  title: string;
  updated: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-lumi-bg">
      <header className="border-b border-lumi-border">
        <div className="max-w-[760px] mx-auto px-6 sm:px-10 py-5 flex items-center justify-between gap-4">
          <Link href="/" className="font-serif font-serif-soft text-[26px] font-semibold tracking-[-0.02em] text-lumi-text">
            Lumi<span className="text-lumi-accent">.</span>
          </Link>
          <nav className="flex gap-5 text-sm font-medium text-lumi-muted">
            <Link href="/privacy" className="hover:text-lumi-text">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-lumi-text">
              Terms
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[760px] mx-auto px-6 sm:px-10 pt-12 sm:pt-16 pb-24">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lumi-subtle">Last updated {updated}</p>
        <h1 className="mt-3 font-serif text-[40px] sm:text-[52px] font-normal leading-[1] tracking-[-0.03em] text-lumi-text">
          {title}
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-lumi-muted">{lede}</p>
        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </main>
    </div>
  );
}

export function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-lumi-border pt-6">
      <h2 className="font-serif text-[24px] font-medium leading-[1.15] tracking-[-0.02em] text-lumi-text">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-lumi-text [&_a]:text-lumi-accent [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </section>
  );
}
