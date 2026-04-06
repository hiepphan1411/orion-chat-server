/**
 * Session timeout configuration
 * Thời gian tối đa không hoạt động trước khi logout (ms)
 */

export const SESSION_TIMEOUT = {
  // 15 phút (mặc định)
  DEFAULT: 15 * 60 * 1000,

  // 5 phút
  STRICT: 5 * 60 * 1000,

  // 30 phút
  EXTENDED: 30 * 60 * 1000,

  // 1 giờ
  LONG: 60 * 60 * 1000,
};

export const getSessionTimeoutMs = (timeoutMinutes: number = 15): number => {
  return timeoutMinutes * 60 * 1000;
};

export const isSessionExpired = (
  lastActivityAt: number | null,
  timeoutMs: number = SESSION_TIMEOUT.DEFAULT,
): boolean => {
  if (!lastActivityAt) return true;

  const now = Date.now();
  const elapsed = now - lastActivityAt;

  return elapsed > timeoutMs;
};
