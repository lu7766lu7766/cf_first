export interface HealthResponse {
  status: string
  runtime: string
  serverTime: string
  uptime: string
}

export interface EdgeInfoResponse {
  rayId: string
  clientIp: string
  colo: string
  country: string
  city: string
  timezone: string
  asn: number
  asOrganization: string
  httpProtocol: string
  tlsVersion: string
  timestamp: number
}

export interface EchoResponse {
  success: boolean
  sender: string
  receivedMessage: string
  replyMessage: string
  processedAt: string
  latencyTestId: string
  error?: string
}

export interface D1NoteItem {
  id: number
  title: string
  created_at: string
}

export interface D1DemoResponse {
  isBound: boolean
  message: string
  instructions?: string[]
  items: D1NoteItem[]
}
