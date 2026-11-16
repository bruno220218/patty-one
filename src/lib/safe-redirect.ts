/** Accepts only same-origin relative paths, so sign-in can't send people elsewhere. */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value, "http://x");
    if (url.origin !== "http://x") {
      if (typeof window === "undefined" || url.origin !== window.location.origin) return undefined;
    }
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/auth")) return undefined;
    return path;
  } catch {
    return undefined;
  }
}
