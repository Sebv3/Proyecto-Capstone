import type { AuthSession } from '../api/auth';

export async function endSession(
  session: AuthSession | null,
  clear: () => Promise<void>,
  revoke: (session: AuthSession) => Promise<void>,
): Promise<void> {
  try {
    await clear();
  } finally {
    // Never restore or retain a local login because the network is unavailable.
    if (session) {
      try { await revoke(session); }
      catch { /* Remote revocation cannot be guaranteed while offline. */ }
    }
  }
}
