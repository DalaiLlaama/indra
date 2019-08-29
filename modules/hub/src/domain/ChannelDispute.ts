import { DisputeStatus } from "connext/types";

export interface ChannelDisputeRow {
  id: number,
  channelId: number,
  startedOn: string,
  reason: string,
  onchainTxIdStart: number | null,
  onchainTxIdEmpty: number | null,
  status: DisputeStatus,
  originator: string,
  disputePeriodEnds: number | null,
}