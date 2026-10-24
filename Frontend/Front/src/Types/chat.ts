/** Retrieval strategies supported by the FastAPI backend. */
export type SearchMethod = "BM_25" | "TFIDF" | "Semantic" | "Hybrid";

/** Payload sent to POST /api/retrieval/search. */
export interface SearchRequest {
  request: string;
  method: SearchMethod;
}

/** A legal case returned by the retrieval pipeline. */
export interface CaseItem {
  /** Stable identifier (backend id when available, otherwise generated). */
  id: string;
  /** Case name or reference ("affaire"). */
  title: string;
  /** What the case is about ("nom de l'affaire"). */
  summary: string;
  /** Relevance score reported by the backend (relative % or distance), if any. */
  relevance_score: number | null;
  /** Full text of the matched document, when the backend provides it. */
  content?: string;
  /** City / location of the case (e.g. Paris, Versailles). */
  location?: string;
  /** Jurisdiction (cour d'appel, tribunal judiciaire, cour de cassation). */
  jurisdiction?: string;
}

export type MessageSender = "user" | "assistant";

export interface Message {
  id: string;
  sender: MessageSender;
  text: string;
  /** Candidate cases to display under an assistant message. */
  cases?: CaseItem[];
  /** True when the message reports a failure (rendered with error styling). */
  isError?: boolean;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

/** Normalised result of a search call, ready for the UI. */
export interface SearchResult {
  cases: CaseItem[];
  /** Informational message from the backend (e.g. "Pas d'affaire trouvée."). */
  message?: string;
}

export const SEARCH_METHODS: ReadonlyArray<{
  value: SearchMethod;
  label: string;
  hint: string;
}> = [
  { value: "Hybrid", label: "Hybride", hint: "Mots-clés et sens combinés" },
  { value: "Semantic", label: "Sémantique", hint: "Recherche par le sens" },
  { value: "BM_25", label: "BM25", hint: "Mots-clés pondérés" },
  { value: "TFIDF", label: "TF-IDF", hint: "Mots-clés, fréquence" },
];