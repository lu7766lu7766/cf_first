/**
 * Cloudflare Workers 與現代環境相容的 Web Crypto PBKDF2 密碼雜湊與驗證工具
 */
export class Hash {
  private static ITERATIONS = 100_000
  private static KEY_LENGTH = 32 // 256 bits

  /**
   * 將 Uint8Array 轉為 Hex 字串
   */
  private static toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * 將 Hex 字串轉回 Uint8Array
   */
  private static fromHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
    }
    return bytes
  }

  /**
   * 對密碼產生安全雜湊
   */
  static async make(password: string): Promise<string> {
    const salt = new Uint8Array(16)
    crypto.getRandomValues(salt)

    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    )

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: this.ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      this.KEY_LENGTH * 8
    )

    const saltHex = this.toHex(salt)
    const hashHex = this.toHex(new Uint8Array(derivedBits))
    return `pbkdf2:${this.ITERATIONS}:${saltHex}:${hashHex}`
  }

  /**
   * 驗證密碼與雜湊是否吻合
   */
  static async verify(password: string, hashed: string): Promise<boolean> {
    if (!hashed || !hashed.startsWith('pbkdf2:')) {
      // 容錯機制：若資料庫仍有純明文舊資料則進行比對
      return password === hashed
    }

    const parts = hashed.split(':')
    if (parts.length !== 4) return false

    const iterations = parseInt(parts[1], 10)
    const salt = this.fromHex(parts[2])
    const expectedHash = parts[3]

    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    )

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      this.KEY_LENGTH * 8
    )

    const actualHash = this.toHex(new Uint8Array(derivedBits))
    return actualHash === expectedHash
  }
}
