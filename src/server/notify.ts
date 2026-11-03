import "server-only";

import { currentCtx, setNotifier } from "@/lib/context";
import { ATLAS_ID } from "@/lib/directory";
import { stamp, uid } from "@/lib/format";
import type { ChatId } from "@/lib/types";
import { registry } from "./workspace";

/**
 * Atlas notices go to each recipient's own DM with Atlas (made if they've never opened
 * it), so people hear about tickets they own wherever the change happened.
 */
setNotifier(async (notices) => {
  const { dir, store } = currentCtx();
  const reg = await registry();
  const channels = await reg.channels(dir.workspace.id);
  const chats: ChatId[] = [];
  for (const n of notices) {
    let dm = channels.find((c) => c.kind === "dm" && c.members?.includes(n.to) && c.members.includes(ATLAS_ID));
    if (!dm) {
      dm = {
        id: `dm${uid()}`, workspaceId: dir.workspace.id, kind: "dm", name: null, topic: "Agent · works on tickets with your permissions",
        team: null, members: [n.to, ATLAS_ID], createdBy: n.to, createdAt: new Date().toISOString(),
      };
      await reg.createChannel(dm);
      channels.push(dm);
    }
    await store.appendMessage(dm.id, { id: uid(), who: ATLAS_ID, time: stamp(), text: n.text });
    chats.push(dm.id);
  }
  return chats;
});
