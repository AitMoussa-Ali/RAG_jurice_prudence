import axios from "axios";
import {request} from "./axios";
import type {
  CaseItem,
  DiscussRequest,
  DiscussResult,
  EvidenceItem,
  SearchMethod,
  SearchRequest,
  SearchResult,
} from "../Types/chat";

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

/** Extracts a readable message from a FastAPI error body ({ detail: string | [{ msg }] }). */
function readErrorDetail(data: unknown): string | undefined {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) =>
          d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : String(d),
        )
        .join(" ; ");
    }
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

const pick = (obj: UnknownRecord, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = asString(obj[key]);
    if (value) return value;
  }
  return undefined;
};

/** Strips ```json fences and parses string payloads; returns the input unchanged if not JSON. */
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

  return {
    id: pick(raw, ["chunk_id", "id", "case_id"]) ?? `case-${index}-${(title ?? summary ?? "").slice(0, 40)}`,
    title: title ?? summary ?? "Affaire sans titre",
    summary: summary ?? "",
    relevance_score: asNumber(raw.score ?? raw.relevance_score),
    content: pick(raw, ["content", "documents", "document", "text"]),
    location: pick(raw, ["localisation", "location", "ville"]),
    jurisdiction: pick(raw, ["juridication", "juridiction", "jurisdiction"]),
    collection_name: pick(raw, ["collection_name", "collection"]),
    source_id: pick(raw, ["source_id"])
  };
}

/**
 * Handles every shape the endpoint may return: JSON string (fenced or not),
 * single case object, array of cases, { cases | results | affaires: [...] },
 * { message }, or { error, raw_content }.
 */
export function normalizeSearchResponse(payload: unknown): SearchResult {
  const data = parseMaybeJson(payload);

  if (typeof data === "string") return { cases: [], message: data };

  if (Array.isArray(data)) {
    const cases = data
      .map((item, i) => {
        const parsed = parseMaybeJson(item);
        return isRecord(parsed) ? toCaseItem(parsed, i) : null;
      })
      .filter((c): c is CaseItem => c !== null);
    return cases.length ? { cases } : { cases: [], message: "Pas d'affaire trouvée." };
  }

  if (isRecord(data)) {
    for (const key of ["cases", "results", "affaires"]) {
      if (Array.isArray(data[key])) return normalizeSearchResponse(data[key]);
    }

    if (typeof data.error === "string") {
      const raw = asString(data.raw_content);
      return {
        cases: [],
        message: raw ?? "La réponse du serveur n'a pas pu être interprétée.",
      };
    }

    const single = toCaseItem(data, 0);
    if (single) return { cases: [single] };

    return { cases: [], message: asString(data.message) ?? "Pas d'affaire trouvée." };
  }

  return { cases: [], message: "Pas d'affaire trouvée." };
}

/* -------------------------------------------------------------------------- */
/* Shared error mapping                                                       */
/* -------------------------------------------------------------------------- */

/** The backend calls an LLM, so allow a generous timeout. */
const REQUEST_TIMEOUT_MS = 120_000;

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (axios.isCancel(err)) {
    return new ApiError("Requête annulée.", "unknown");
  }

  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const detail = readErrorDetail(err.response?.data);

    if (status === 422) {
      return new ApiError(
        detail ?? "Requête invalide : vérifiez les champs envoyés.",
        "validation",
        status,
      );
    }
    if (status !== undefined && status >= 500) {
      return new ApiError(
        detail ?? "Une erreur est survenue côté serveur pendant la recherche juridique.",
        "server",
        status,
      );
    }
    if (status !== undefined) {
      return new ApiError(detail ?? `Erreur inattendue (HTTP ${status}).`, "unknown", status);
    }
    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      return new ApiError(
        "Le serveur met trop de temps à répondre. Réessayez dans un instant.",
        "timeout",
      );
    }
    return new ApiError(
      "Impossible de joindre le serveur. Vérifiez que l'API est démarrée et que CORS est autorisé.",
      "network",
    );
  }

  return new ApiError("Une erreur inattendue est survenue.", "unknown");
}

/* -------------------------------------------------------------------------- */
/* Search call                                                                */
/* -------------------------------------------------------------------------- */

export async function searchCases(
  query: string,
  method: SearchMethod,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const payload: SearchRequest = { request: query.trim(), method };

  // /search declares `request` and `method` as Form(...) fields: send them
  // form-encoded (axios sets the Content-Type for URLSearchParams).
  const form = new URLSearchParams();
  form.append("request", payload.request);
  form.append("method", payload.method);

  try {
    const { data } = await request.post<unknown>("retrieval/search", form, {
      signal,
      timeout: REQUEST_TIMEOUT_MS,
    });
    console.log(data);
    
    return normalizeSearchResponse(data);
  } catch (err) {
    throw toApiError(err);
  }
}

/* -------------------------------------------------------------------------- */
/* Discussion call                                                            */
/* -------------------------------------------------------------------------- */

function toEvidenceItem(raw: unknown, index: number): EvidenceItem | null {
  if (!isRecord(raw)) return null;
  const excerpt = pick(raw, ["documents", "document", "content", "text"]);
  if (!excerpt) return null;
  const meta = raw.metadatas ?? raw.metadata;
  return {
    id: pick(raw, ["id", "chunk_id"]) ?? `evidence-${index}`,
    excerpt,
    metadata: isRecord(meta) ? meta : undefined,
  };
}

/** Handles { answer, evidence }, { message } and plain / JSON-string payloads. */
export function normalizeDiscussResponse(payload: unknown): DiscussResult {
  const data = parseMaybeJson(payload);

  if (typeof data === "string") return { answer: data, evidence: [] };

  if (isRecord(data)) {
    const answer = asString(data.answer) ?? asString(data.message);
    if (answer) {
      const evidence = Array.isArray(data.evidence)
        ? data.evidence
            .map((e, i) => toEvidenceItem(e, i))
            .filter((e): e is EvidenceItem => e !== null)
        : [];
      return { answer, evidence };
    }
  }

  return { answer: "La réponse du serveur n'a pas pu être interprétée.", evidence: [] };
}

export interface DiscussParams {
  query: string;
  method: SearchMethod;
  /** One id per selected case: the backend refuses to mix cases in a conversation. */
  conversationId: string;
  selectedCase: CaseItem;
}

export async function discussCase(
  { query, method, conversationId, selectedCase }: DiscussParams,
  signal?: AbortSignal,
): Promise<DiscussResult> {
  if (!selectedCase.collection_name) {
    throw new ApiError(
      "L'affaire retenue n'a pas d'identifiant de passage (chunk_id / collection_name) : " +
        "la recherche doit les renvoyer pour pouvoir discuter de cette affaire.",
      "validation",
    );
  }

  // `selected_case` is stored by the backend and injected in the LLM prompt,
  // so include the descriptive fields next to the two required identifiers.
  const body: DiscussRequest = {
    search: {
      chunk_id: selectedCase.id,
      collection_name: selectedCase.collection_name,
      affaire: selectedCase.title,
      "nom de l'affaire": selectedCase.summary || undefined,
      localisation: selectedCase.location,
      juridication: selectedCase.jurisdiction,
      source_id: selectedCase.source_id,
    },
    discussion: [], // history lives server-side, keyed by conversation_id
    query: query.trim(),
    conversation_id: conversationId,
    method,
  };

  try {
    console.log(body);
    
    // JSON body: `search` is a nested object and cannot travel as a form field.
    const { data } = await request.post<unknown>("retrieval/discuss", body, {
      signal,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return normalizeDiscussResponse(data);
  } catch (err) {
    throw toApiError(err);
  }
}