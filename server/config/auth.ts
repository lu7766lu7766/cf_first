export interface AuthConfig {
  defaultGuard: 'jwt' | 'tokens'
  /**
   * SSO 單一連線互斥開關
   * - false: 關閉（預設），允許多裝置同時登入並發送請求
   * - true: 開啟，當任一 Token 發出請求被使用時，自動註銷該使用者的其他歷史 Token
   */
  ssoEnabled: boolean
  guards: {
    jwt: {
      expiresIn: number | null // 秒數，設為 null 則永不過期
    }
    tokens: {
      type: string
      /**
       * Token 有效期限 (秒數)
       * - 設定數字 (如 60 * 60 * 24 * 30): 30 天後過期
       * - 設定為 null 或 0: 永不過期（直到使用者主動登出/被註銷）
       */
      expiresIn: number | null
    }
  }
}

export const authConfig: AuthConfig = {
  // 預設 Guard
  defaultGuard: 'tokens',

  // SSO 單一登入互斥管制開關（直接在此 config 設定，預設為關閉 false）
  ssoEnabled: false,

  guards: {
    jwt: {
      expiresIn: 60 * 60 * 24 // 24 小時
    },
    tokens: {
      type: 'opaque',
      // 設定為 null 或 0 代表永不過期 (資料庫中 expires_at 為 NULL)
      expiresIn: null
    }
  }
}
