export const CLIENT_EVENTS = {
  CONNECTION_PING: "connection:ping",
} as const;

export const SERVER_EVENTS = {
  CONNECTION_READY: "connection:ready",
} as const;

export type AcknowledgementSuccess<TData> = {
  ok: true;
  data: TData;
};

export type AcknowledgementFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type Acknowledgement<TData> =
  | AcknowledgementSuccess<TData>
  | AcknowledgementFailure;

export type ConnectionReadyPayload = {
  socketId: string;
  connectedAt: string;
};

export type ConnectionPingPayload = {
  sentAt: string;
};

export type ConnectionPingResult = {
  sentAt: string;
  receivedAt: string;
};

export interface ClientToServerEvents {
  [CLIENT_EVENTS.CONNECTION_PING]: (
    payload: ConnectionPingPayload,
    acknowledge: (response: Acknowledgement<ConnectionPingResult>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  [SERVER_EVENTS.CONNECTION_READY]: (
    payload: ConnectionReadyPayload,
  ) => void;
}

export interface InterServerEvents {
  realtimeHealthCheck: () => void;
}

export interface SocketData {
  connectedAt: string;
}