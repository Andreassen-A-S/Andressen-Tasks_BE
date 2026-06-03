import geoip from "geoip-lite";

export function parseLocation(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const geo = geoip.lookup(ip);
  if (!geo) return undefined;
  return [geo.city, geo.country].filter(Boolean).join(", ") || undefined;
}

export function parseBrowserDeviceName(
  ua: string | undefined,
): string | undefined {
  if (!ua) return undefined;

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;

  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Linux/.test(ua)
        ? "Linux"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad/.test(ua)
            ? "iOS"
            : null;

  if (!browser) return undefined;
  return os ? `${browser} (${os})` : browser;
}
