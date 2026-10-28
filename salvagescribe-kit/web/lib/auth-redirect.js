// Only allow local destinations; reject protocol-relative URLs and backslashes.
export function safeNext(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || /^\/(login|auth)(\/|$)/.test(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}
