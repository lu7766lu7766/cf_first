export interface CorsConfig {
  origin: string | string[]
  methods: string[]
  headers: string[]
  credentials: boolean
}

export const corsConfig: CorsConfig = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  headers: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}
