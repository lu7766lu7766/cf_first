import { authMiddleware } from '../../core/auth'

export const auth = (guard: 'jwt' | 'tokens' = 'tokens') => authMiddleware(guard)
