import { Suspense } from "react";

import { MissionBoard } from "@/components/missions/mission-board";

export const metadata = { title: "Mission" };

/** Mission ids are created at runtime: read the param inside Suspense (Cache Components). */
export default function MissionPage({ params }: PageProps<"/missions/[id]">) {
  return (
    <Suspense fallback={<div className="h-full bg-background" />}>
      {params.then(({ id }) => (
        <MissionBoard id={id} />
      ))}
    </Suspense>
  );
}
