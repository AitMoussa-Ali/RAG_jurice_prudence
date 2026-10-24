import type {
  CaseItem,
  SearchMethod,
  SearchRequest,
  SearchResult,
} from "../Types/chat";

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const DEFAULT_API_URL = "http://localhost:8000";

/** Vite: VITE_API_BASE_URL. Falls back to localhost for local development. */
export const API_BASE_URL: string = (
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_API_BASE_URL) ||
  DEFAULT_API_URL
).replace(/\/+$/, "");

const SEARCH_ENDPOINT = "/api/retrieval/search";

/** The backend calls an LLM after retrieval, so allow a generous timeout. */
const REQUEST_TIMEOUT_MS = 120_000;

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export type ApiErrorKind = "validation" | "server" | "network" | "timeout" | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

/** Extracts a human-readable message from a FastAPI error body. */
async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const data: unknown = await response.json();
    if (data && typeof data === "object" && "detail" in data) {
      const detail = (data as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      // FastAPI/Pydantic validation errors: [{ loc, msg, type }, ...]
      if (Array.isArray(detail)) {
        return detail
          .map((d) =>
            d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : String(d),
          )
          .join(" ; ");
      }
    }
  } catch {
    /* body was not JSON */
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Response normalisation                                                      */
/* -------------------------------------------------------------------------- */

type UnknownRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRecord =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | undefined => {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
};

const asNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", ".").replace("%", ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** First non-empty string among several candidate keys (the LLM output keys vary). */
const pick = (obj: UnknownRecord, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = asString(obj[key]);
    if (value) return value;
  }
  return undefined;
};

/** Removes ```json fences and parses a string payload; returns the raw string if it is not JSON. */
function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!cleaned) return value;
  try {
    return JSON.parse(cleaned);
  } catch {
    return value;
  }
}

function toCaseItem(raw: UnknownRecord, index: number): CaseItem | null {
  const title = pick(raw, ["affaire", "title", "titre", "name", "nom"]);
  const summary = pick(raw, [
    "nom de l'affaire",
    "nom_de_l_affaire",
    "summary",
    "resume",
    "résumé",
    "description",
  ]);

  if (!title && !summary) return null;

  const location = pick(raw, ["localisation", "location", "ville"]);
  const jurisdiction = pick(raw, ["juridication", "juridiction", "jurisdiction"]);
  const explicitId = pick(raw, ["id", "case_id"]);

  return {
    id: explicitId ?? `case-${index}-${(title ?? summary ?? "").slice(0, 40)}`,
    title: title ?? summary ?? "Affaire sans titre",
    summary: summary ?? "",
    relevance_score: asNumber(raw.score ?? raw.relevance_score),
    content: pick(raw, ["content", "documents", "document", "text"]),
    location,
    jurisdiction,
  };
}

/**
 * Accepts every shape the endpoint may produce:
 *  - a JSON string (optionally wrapped in a Markdown fence)
 *  - a single case object
 *  - an array of case objects
 *  - an envelope such as { cases: [...] } / { results: [...] }
 *  - { message } when nothing was found
 *  - { error, raw_content } when the LLM returned invalid JSON
 */
export function normalizeSearchResponse(payload: unknown): SearchResult {
  const data = parseMaybeJson(payload);

  if (typeof data === "string") {
    return { cases: [], message: data };
  }

  if (Array.isArray(data)) {
    const cases = data
      .map((item, i) => (isRecord(parseMaybeJson(item)) ? toCaseItem(parseMaybeJson(item) as UnknownRecord, i) : null))
      .filter((c): c is CaseItem => c !== null);
    return cases.length
      ? { cases }
      : { cases: [], message: "Pas d'affaire trouvée." };
  }

  if (isRecord(data)) {
    for (const key of ["cases", "results", "affaires"]) {
      if (Array.isArray(data[key])) return normalizeSearchResponse(data[key]);
    }

    if (typeof data.error === "string") {
      const raw = asString(data.raw_content);
      // The LLM answered, just not in JSON: surface its text rather than failing.
      return raw
        ? { cases: [], message: raw }
        : { cases: [], message: "La réponse du serveur n'a pas pu être interprétée." };
    }

    const single = toCaseItem(data, 0);
    if (single) return { cases: [single] };

    const message = asString(data.message);
    return { cases: [], message: message ?? "Pas d'affaire trouvée." };
  }

  return { cases: [], message: "Pas d'affaire trouvée." };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function searchCases(
  request: string,
  method: SearchMethod,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const body: SearchRequest = { request: request.trim(), method };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
  // Forward an external abort (e.g. component unmount) to our controller.
  const onExternalAbort = () => controller.abort("cancelled");
  signal?.addEventListener("abort", onExternalAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${SEARCH_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted && controller.signal.reason === "timeout") {
      throw new ApiError(
        "Le serveur met trop de temps à répondre. Réessayez dans un instant.",
        "timeout",
      );
    }
    if (controller.signal.aborted) {
      throw new ApiError("Requête annulée.", "unknown");
    }
    throw new ApiError(
      `Impossible de joindre le serveur (${API_BASE_URL}). Vérifiez que l'API est démarrée et que CORS est autorisé.`,
      "network",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onExternalAbort);
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    if (response.status === 422) {
      throw new ApiError(
        detail ?? "Requête invalide : la question et la méthode sont obligatoires.",
        "validation",
        422,
      );
    }
    if (response.status >= 500) {
      throw new ApiError(
        detail ?? "Une erreur est survenue côté serveur pendant la recherche juridique.",
        "server",
        response.status,
      );
    }
    throw new ApiError(
      detail ?? `Erreur inattendue (HTTP ${response.status}).`,
      "unknown",
      response.status,
    );
  }

  // The endpoint may return JSON (object / array / string) or plain text.
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    /* keep raw text; normalizeSearchResponse will handle it */
  }

  return normalizeSearchResponse(payload);
}