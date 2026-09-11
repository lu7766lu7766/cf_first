import { authMiddleware } from '../../core/auth'

export const auth = (guard: 'jwt' | 'tokens' = 'jwt') => authMiddleware(guard)
