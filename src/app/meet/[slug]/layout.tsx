import type { Metadata } from "next";
import { formatRange, parseKey } from "@/lib/meet";
import { meetStore } from "@/lib/meetStore";

export const dynamic = "force-dynamic";

const FALLBACK: Metadata = {
  title: "Group poll · Lumi",
  description: "Pick when you're free.",
  openGraph: { title: "Group poll · Lumi", description: "Pick when you're free.", type: "website" },
};

/**
 * Link preview for a poll. The page itself is a client component, so the
 * Open Graph tags come from this server layout: a pasted link in the group
 * chat shows the title and how many days are on the grid.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await meetStore()
    .get(slug)
    .catch(() => null);
  if (!found) return FALLBACK;

  const { poll } = found;
  const n = poll.days.length;
  const description =
    poll.finalStart && poll.finalEnd
      ? `Picked: ${formatRange({ day: parseKey(poll.finalStart)!.day, start: poll.finalStart, end: poll.finalEnd })}`
      : `${n} day${n === 1 ? "" : "s"} · pick when you're free`;
  const title = `${poll.title} · Lumi`;
  return {
    title,
    description,
    openGraph: { title: poll.title, description, type: "website", siteName: "Lumi" },
    twitter: { card: "summary", title: poll.title, description },
  };
}

export default function MeetPollLayout({ children }: { children: React.ReactNode }) {
  return children;
}
