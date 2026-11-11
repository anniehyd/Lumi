import Link from "next/link";
import { Clause, LegalPage, contact } from "@/components/LegalPage";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Privacy · Lumi",
  description: "What Lumi reads, what it keeps, for how long, and how to delete it.",
};

/** Named only when the deployment is configured for it; otherwise described. */
function modelProvider(): { name: string; anthropic: boolean } {
  const model = (process.env.LLM_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude").toLowerCase();
  const provider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const anthropic = provider ? provider === "anthropic" : model.startsWith("claude");
  return { name: anthropic ? "Anthropic (the Claude API)" : "the language-model provider this deployment is configured with", anthropic };
}

export default function PrivacyPage() {
  const c = contact();
  const model = modelProvider();
  return (
    <LegalPage
      title="Privacy"
      updated="November 10, 2026"
      lede="Lumi finds the events in your email and asks whether you are going. This page says exactly what it reads to do that, what it keeps, and how to make it forget you."
    >
      <Clause title="What signing in shares">
        <p>
          Signing in with Google gives Lumi your name, your email address and your profile picture. Nothing else.
          Signing in alone does not let Lumi see any mail or any calendar.
        </p>
      </Clause>

      <Clause title="What Lumi reads, if you let it">
        <p>Mail reaches Lumi in one of three ways. Each is your choice, and each can be turned off.</p>
        <ul>
          <li>
            <strong>Gmail, read-only.</strong> If you connect Gmail, Lumi reads new messages in your Inbox tab about
            twice a day. It does not read Promotions, Social, Updates, Forums, archived mail or sent mail, and it
            cannot send, delete or change anything in your mailbox.
          </li>
          <li>
            <strong>Google Calendar.</strong> The same connection lets Lumi check whether an event overlaps
            something already on your calendar, and add an event when you accept it. Lumi never adds, accepts or
            declines anything on its own.
          </li>
          <li>
            <strong>Forwarding.</strong> Instead of connecting Gmail you can forward mail to a private Lumi address.
            Lumi then sees only what you forward.
          </li>
          <li>
            <strong>Handshake.</strong> If you paste your Handshake calendar link, Lumi reads the events on that
            feed.
          </li>
        </ul>
      </Clause>

      <Clause title="What Lumi keeps, and for how long">
        <ul>
          <li>
            <strong>Email.</strong> The sender, subject and text of each message it read, for 14 days, then deleted
            automatically.
          </li>
          <li>
            <strong>Events.</strong> The events found in that mail and what you decided about each, until the event
            has passed.
          </li>
          <li>
            <strong>Your interests.</strong> What you told Lumi you care about, so it can rank events for you.
          </li>
          <li>
            <strong>Counts.</strong> How many emails were scanned, how many events were found and accepted, and
            what the processing cost. Numbers only, no content.
          </li>
          <li>
            <strong>Access tokens.</strong> The credentials Google issues when you connect Gmail and Calendar, kept
            so the twice-daily check can run while you are away.
          </li>
        </ul>
      </Clause>

      <Clause title="Who else sees it">
        <p>
          Most mail is ruled out by simple rules and never leaves Lumi. A message that looks like it contains an
          event is sent to {model.name} so a language model can pull out the date, place and title.
          {model.anthropic && " Anthropic does not use data sent through its API to train its models."}
        </p>
        <p>
          Lumi is hosted on Fly.io in the United States. If error monitoring is switched on, a crash report with
          technical details goes to Sentry.
        </p>
        <p>
          That is the whole list. Lumi does not sell your data, show ads, or share your mail with anyone else. The
          operator&rsquo;s dashboard shows counts and timestamps, not content, and the operator does not read your
          mail unless you ask for help with a specific message.
        </p>
      </Clause>

      <Clause title="Google user data">
        <p>
          Lumi&rsquo;s use and transfer to any other app of information received from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In plain terms: Gmail and Calendar data is used only to show
          you events and put the ones you accept on your calendar. It is not used for advertising, not used to
          train general-purpose AI models, and not read by a person except with your permission or where the law
          requires it.
        </p>
      </Clause>

      <Clause title="Deleting your data">
        <p>
          <Link href="/settings">Settings</Link> → Account → Delete account removes your account and everything
          stored under it at once, and revokes Lumi&rsquo;s access to your Google account. Events Lumi already
          wrote to your Google Calendar stay there; they are yours.
        </p>
        <p>
          You can also cut off access from Google&rsquo;s side at any time at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </p>
      </Clause>

      <Clause title="The rest">
        <p>Lumi is not meant for children under 13.</p>
        <p>
          If this page changes in a way that matters, the date at the top changes and signed-in users are told
          before the change applies.
        </p>
        <p>
          Questions, or a request about your data: <a href={c.href}>{c.label}</a>.
        </p>
      </Clause>
    </LegalPage>
  );
}
