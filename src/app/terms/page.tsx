import Link from "next/link";
import { Clause, LegalPage, contact } from "@/components/LegalPage";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Terms · Lumi",
  description: "The short agreement for using Lumi during its beta.",
};

export default function TermsPage() {
  const c = contact();
  return (
    <LegalPage
      title="Terms"
      updated="November 10, 2026"
      lede="Lumi is a free beta run by its developer. These are the terms for using it, kept short on purpose."
    >
      <Clause title="What Lumi does">
        <p>
          Lumi reads the mail you point it at, finds events, and asks you about each one. You make every decision;
          Lumi only writes to your calendar when you accept an event.
        </p>
      </Clause>

      <Clause title="It will sometimes be wrong">
        <p>
          Events are extracted by software, including a language model. Lumi can miss an event, get a time or a
          place wrong, or show something that is not an event. Check the original email before relying on a card
          for anything that matters, such as an interview or a deadline.
        </p>
      </Clause>

      <Clause title="Your account">
        <p>
          You need a Google account to sign in, and you may only connect mailboxes and calendars that are yours.
          Do not use Lumi to break the law, to get at someone else&rsquo;s data, or to overload or probe the
          service.
        </p>
        <p>
          You can leave at any time from <Link href="/settings">Settings</Link>, which deletes your data. How
          data is handled is described in the <Link href="/privacy">privacy page</Link>.
        </p>
      </Clause>

      <Clause title="A beta, with limits">
        <p>
          Lumi is free while in beta. To keep it that way the number of accounts is limited, each account has a
          daily processing limit, and scanning pauses for accounts that have not been opened in a while. The
          service may change, be unavailable, or end; if it ends, stored data is deleted.
        </p>
        <p>An account that abuses the service may be closed.</p>
      </Clause>

      <Clause title="No warranty">
        <p>
          Lumi is provided as is, without warranties of any kind. To the extent the law allows, its developer is
          not liable for losses that come from using it, including a missed or mistaken event.
        </p>
        <p>
          The source code is open under the MIT license at{" "}
          <a href="https://github.com/anniehyd/Lumi" target="_blank" rel="noreferrer">
            github.com/anniehyd/Lumi
          </a>
          .
        </p>
      </Clause>

      <Clause title="Changes and contact">
        <p>
          If these terms change in a way that matters, the date at the top changes and signed-in users are told
          first. Questions: <a href={c.href}>{c.label}</a>.
        </p>
      </Clause>
    </LegalPage>
  );
}
