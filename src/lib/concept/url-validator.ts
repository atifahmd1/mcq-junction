// ============================================================================
// MCQ Junction — Media & URL Security Validator
// File: src/lib/concept/url-validator.ts
// ============================================================================

export interface VideoParseResult {
  isValid: boolean;
  provider: "youtube" | "vimeo" | "direct" | "unsupported";
  embedUrl?: string;
  directUrl?: string;
  error?: string;
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Validates whether a URL uses an allowed protocol and is a well-formed URL.
 * Strictly blocks 'javascript:', 'data:', 'vbscript:', 'blob:', 'file:'.
 */
export function validateSafeUrl(rawUrl: string | null | undefined): {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
} {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: false, error: "URL is empty or not a string" };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { isValid: false, error: "URL is empty" };
  }

  // Reject obvious protocol smuggling or javascript/data schemes
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) {
    return { isValid: false, error: "Forbidden URL scheme/protocol detected" };
  }

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return {
        isValid: false,
        error: `Protocol '${parsed.protocol}' is not permitted. Only HTTP and HTTPS are allowed.`,
      };
    }

    return { isValid: true, sanitizedUrl: parsed.toString() };
  } catch {
    return { isValid: false, error: "Malformed URL could not be parsed" };
  }
}

/**
 * Validates an image URL for safe rendering in <img> tags.
 * Only HTTP/HTTPS protocols or valid relative application paths are permitted.
 */
export function isSafeImageUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();

  // Allow safe relative paths e.g. /images/...
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) {
    return true;
  }

  const check = validateSafeUrl(trimmed);
  return check.isValid;
}

/**
 * Parses a video URL and validates supported providers (YouTube, Vimeo, direct MP4/WebM).
 * Strictly guarantees that any generated iframe embed URL originates exclusively from
 * trusted, hardened origins (youtube-nocookie.com or player.vimeo.com).
 */
export function parseVideoUrl(rawUrl: string | null | undefined): VideoParseResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      isValid: false,
      provider: "unsupported",
      error: "No video URL provided",
    };
  }

  const check = validateSafeUrl(rawUrl);
  if (!check.isValid || !check.sanitizedUrl) {
    return {
      isValid: false,
      provider: "unsupported",
      error: check.error ?? "Invalid video URL",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(check.sanitizedUrl);
  } catch {
    return {
      isValid: false,
      provider: "unsupported",
      error: "Unable to parse video URL",
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 1. YouTube Verification
  // Supported formats:
  // - youtube.com/watch?v=VIDEO_ID
  // - youtu.be/VIDEO_ID
  // - youtube.com/embed/VIDEO_ID
  // - youtube-nocookie.com/embed/VIDEO_ID
  const isYouTube =
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtu.be" ||
    hostname === "youtube-nocookie.com" ||
    hostname === "www.youtube-nocookie.com";

  if (isYouTube) {
    let videoId: string | null = null;

    if (hostname === "youtu.be") {
      const pathPart = parsed.pathname.slice(1).split("/")[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(pathPart)) {
        videoId = pathPart;
      }
    } else if (parsed.pathname.startsWith("/embed/")) {
      const pathPart = parsed.pathname.replace("/embed/", "").split("/")[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(pathPart)) {
        videoId = pathPart;
      }
    } else {
      const v = parsed.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        videoId = v;
      }
    }

    if (videoId) {
      return {
        isValid: true,
        provider: "youtube",
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`,
      };
    }

    return {
      isValid: false,
      provider: "unsupported",
      error: "Unrecognized YouTube video ID format",
    };
  }

  // 2. Vimeo Verification
  // Supported formats:
  // - vimeo.com/VIDEO_ID
  // - player.vimeo.com/video/VIDEO_ID
  const isVimeo =
    hostname === "vimeo.com" ||
    hostname === "www.vimeo.com" ||
    hostname === "player.vimeo.com";

  if (isVimeo) {
    let videoId: string | null = null;
    const segments = parsed.pathname.split("/").filter(Boolean);

    for (const seg of segments) {
      if (/^\d{6,12}$/.test(seg)) {
        videoId = seg;
        break;
      }
    }

    if (videoId) {
      return {
        isValid: true,
        provider: "vimeo",
        embedUrl: `https://player.vimeo.com/video/${videoId}?dnt=1`,
      };
    }

    return {
      isValid: false,
      provider: "unsupported",
      error: "Unrecognized Vimeo video ID format",
    };
  }

  // 3. Direct HTML5 Video File Verification (.mp4, .webm, .ogg)
  const pathname = parsed.pathname.toLowerCase();
  const isDirectVideo =
    pathname.endsWith(".mp4") ||
    pathname.endsWith(".webm") ||
    pathname.endsWith(".ogg");

  if (isDirectVideo) {
    return {
      isValid: true,
      provider: "direct",
      directUrl: check.sanitizedUrl,
    };
  }

  // Untrusted / Unsupported provider
  return {
    isValid: false,
    provider: "unsupported",
    error: `Unsupported video provider domain '${hostname}'. Only YouTube, Vimeo, and direct MP4/WebM files are allowed.`,
  };
}

/**
 * Sanitizes external reference links to prevent javascript: or malformed links.
 */
export function sanitizeExternalUrl(rawUrl: string | null | undefined): string | null {
  const check = validateSafeUrl(rawUrl);
  return check.isValid && check.sanitizedUrl ? check.sanitizedUrl : null;
}
