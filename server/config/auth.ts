export interface AuthConfig {
  defaultGuard: 'jwt' | 'tokens'
  guards: {
    jwt: {
      expiresIn: number
    }
    tokens: {
      type: string
    }
  }
}

export const authConfig: AuthConfig = {
  defaultGuard: 'jwt',
  guards: {
    jwt: {
      expiresIn: 60 * 60 * 24 // 24 小時
    },
    tokens: {
      type: 'opaque'
    }
  }
}
