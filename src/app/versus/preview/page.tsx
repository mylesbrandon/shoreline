import { TEAMS, type TeamId } from "@/game/versus/contract";
import { VersusPreview, type VersusPreviewTarget } from "./VersusPreview";

const TARGETS: readonly VersusPreviewTarget[] = ["captain", "navigator", "spectator", "results"];

/** MOCK 2v2 sandbox: /versus/preview?view=captain|navigator|spectator|results&team=blue|red */
export default async function VersusPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const target = TARGETS.find((t) => t === query.view) ?? "spectator";
  const team: TeamId = TEAMS.find((t) => t === query.team) ?? "blue";
  return <VersusPreview target={target} team={team} />;
}
