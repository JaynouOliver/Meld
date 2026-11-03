/**
 * The app API. Every screen reads and writes through these functions via the
 * React Query hooks in src/hooks.
 *
 * - Default: calls the Next.js server (/api/rpc), where data lives and Atlas runs on Meta's Model API.
 * - NEXT_PUBLIC_DATA_MODE=local: runs entirely in the browser (used by the single-file preview).
 */
import * as local from "./service";
import * as remote from "./remote";

const impl = process.env.NEXT_PUBLIC_DATA_MODE === "local" ? local : remote;

export const getMessages = impl.getMessages;
export const getTickets = impl.getTickets;
export const getWeekActivity = impl.getWeekActivity;
export const postMessage = impl.postMessage;
export const askAtlas = impl.askAtlas;
export const teammateReply = impl.teammateReply;
export const createTicket = impl.createTicket;
export const updateTicket = impl.updateTicket;
export const deleteTicket = impl.deleteTicket;
export const resetWorkspace = impl.resetWorkspace;
export const decideAction = impl.decideAction;
export const getAgentRuns = impl.getAgentRuns;

export type {
  AskAtlasInput,
  AskAtlasResult,
  DecideActionInput,
  DecideActionResult,
  PostMessageInput,
  PostedMessage,
  TicketPatch,
  UpdateTicketInput,
  UpdateTicketResult,
} from "./service";
export { ApiError } from "./service";
