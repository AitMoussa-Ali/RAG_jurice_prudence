import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ApiError, searchCases } from "../Services/Api";
import {
  SEARCH_METHODS,
  type CaseItem,
  type Message,
  type SearchMethod,
} from "../Types/chat";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const makeId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatScore = (score: number | null): string | null =>
  score === null ? null : score.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  sender: "assistant",
  text: "Décrivez le sujet ou les faits qui vous intéressent. Je recherche les affaires correspondantes dans les cours d'appel, tribunaux judiciaires et la Cour de cassation.",
  timestamp: new Date().toISOString(),
};

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const SendIcon = () => (
  <svg {...iconProps}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </svg>
);
const CloseIcon = () => (
  <svg {...iconProps} width={14} height={14}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
const ScaleIcon = () => (
  <svg {...iconProps} width={18} height={18}>
    <path d="M12 3v18" />
    <path d="M6 21h12" />
    <path d="M5 7h14" />
    <path d="m5 7-3 8a3.5 3.5 0 0 0 6 0Z" />
    <path d="m19 7-3 8a3.5 3.5 0 0 0 6 0Z" />
  </svg>
);
const AlertIcon = () => (
  <svg {...iconProps} width={18} height={18}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

interface HeaderProps {
  selectedCase: CaseItem | null;
  onClearSelection: () => void;
}

function Header({ selectedCase, onClearSelection }: HeaderProps) {
  return (
    <header className="shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <ScaleIcon />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight text-slate-900">
              Recherche d'affaires juridiques
            </h1>
            <p className="truncate text-sm text-slate-500">
              Jurisprudence française, cours d'appel à Cour de cassation
            </p>
          </div>
        </div>

        {selectedCase && (
          <div
            className="flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 py-1 pl-3 pr-1 text-sm text-indigo-800"
            role="status"
            aria-live="polite"
          >
            <span className="shrink-0 text-indigo-500">Affaire retenue :</span>
            <span className="truncate font-medium" title={selectedCase.title}>
              {selectedCase.title}
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Désélectionner l'affaire"
              className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-indigo-600 transition-colors hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <CloseIcon />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* CaseSelector                                                               */
/* -------------------------------------------------------------------------- */

interface CaseSelectorProps {
  cases: CaseItem[];
  selectedId: string | null;
  onSelect: (item: CaseItem) => void;
}

function CaseSelector({ cases, selectedId, onSelect }: CaseSelectorProps) {
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Affaires trouvées">
      {cases.map((item) => {
        const isSelected = item.id === selectedId;
        const score = formatScore(item.relevance_score);
        const meta = [item.jurisdiction, item.location].filter(Boolean).join(", ");

        return (
          <li key={item.id} className="flex">
            <button
              type="button"
              onClick={() => onSelect(item)}
              aria-pressed={isSelected}
              className={[
                "group relative flex w-full flex-col rounded-xl border bg-white p-4 text-left transition duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
                isSelected
                  ? "border-indigo-500 shadow-md ring-1 ring-indigo-500"
                  : "border-slate-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md motion-reduce:hover:translate-y-0",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border transition",
                  isSelected
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 text-transparent group-hover:border-indigo-300",
                ].join(" ")}
              >
                <svg {...iconProps} width={12} height={12} strokeWidth={3}>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>

              <span className="pr-7 text-sm font-semibold leading-snug text-slate-900">
                {item.title}
              </span>
              {item.summary && (
                <span className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-600">
                  {item.summary}
                </span>
              )}

              {(meta || score) && (
                <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  {meta && <span>{meta}</span>}
                  {score && (
                    <span className="ml-auto font-medium text-slate-700">Score {score}</span>
                  )}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* MessageList                                                                */
/* -------------------------------------------------------------------------- */

function TypingIndicator() {
  return (
    <div className="flex justify-start" role="status" aria-label="Recherche en cours">
      <div className="w-full max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm sm:max-w-md">
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 motion-reduce:animate-pulse"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
          <span className="ml-2 text-sm text-slate-500">Recherche en cours…</span>
        </div>
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-2.5 w-11/12 animate-pulse rounded bg-slate-100" />
          <div className="h-2.5 w-3/4 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  selectedId: string | null;
  onSelectCase: (item: CaseItem) => void;
}

function MessageBubble({ message, selectedId, onSelectCase }: MessageBubbleProps) {
  const isUser = message.sender === "user";
  const hasCases = !!message.cases?.length;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "min-w-0",
          hasCases ? "w-full" : "max-w-[85%] sm:max-w-xl",
        ].join(" ")}
      >
        <div
          className={[
            "w-fit max-w-full whitespace-pre-wrap break-words px-4 py-2.5 text-[15px] leading-relaxed",
            isUser
              ? "ml-auto rounded-2xl rounded-tr-sm bg-indigo-600 text-white"
              : message.isError
                ? "rounded-2xl rounded-tl-sm border border-red-200 bg-red-50 text-red-800"
                : "rounded-2xl rounded-tl-sm border border-slate-200 bg-white text-slate-800 shadow-sm",
          ].join(" ")}
        >
          {message.text}
        </div>

        {hasCases && (
          <CaseSelector
            cases={message.cases!}
            selectedId={selectedId}
            onSelect={onSelectCase}
          />
        )}

        <time
          dateTime={message.timestamp}
          className={`mt-1 block px-1 text-xs text-slate-400 ${isUser ? "text-right" : ""}`}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  selectedId: string | null;
  onSelectCase: (item: CaseItem) => void;
}

function MessageList({ messages, loading, selectedId, onSelectCase }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // Smooth-scroll to the newest content whenever messages or loading change.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, selectedId]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" role="log" aria-live="polite">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            selectedId={selectedId}
            onSelectCase={onSelectCase}
          />
        ))}
        {loading && <TypingIndicator />}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ErrorBanner                                                                */
/* -------------------------------------------------------------------------- */

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
}

function ErrorBanner({ message, onDismiss, onRetry }: ErrorBannerProps) {
  return (
    <div className="shrink-0 border-t border-red-200 bg-red-50" role="alert">
      <div className="mx-auto flex w-full max-w-4xl items-start gap-3 px-4 py-2.5 text-sm text-red-800 sm:px-6">
        <span className="mt-0.5 shrink-0 text-red-500">
          <AlertIcon />
        </span>
        <p className="min-w-0 flex-1 break-words">{message}</p>
        <div className="flex shrink-0 items-center gap-1">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md px-2 py-1 font-medium text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Réessayer
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fermer le message d'erreur"
            className="flex h-7 w-7 items-center justify-center rounded-md text-red-600 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ChatInput                                                                  */
/* -------------------------------------------------------------------------- */

interface ChatInputProps {
  method: SearchMethod;
  onMethodChange: (method: SearchMethod) => void;
  onSubmit: (text: string) => void;
  disabled: boolean;
}

function ChatInput({ method, onMethodChange, onSubmit, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = value.trim().length > 0 && !disabled;
  const currentHint = SEARCH_METHODS.find((m) => m.value === method)?.hint;

  // Auto-grow the textarea up to a maximum height.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit(value.trim());
    setValue("");
  }, [canSubmit, onSubmit, value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-4xl px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 sm:flex-row sm:items-end">
          <label htmlFor="chat-input" className="sr-only">
            Votre recherche
          </label>
          <textarea
            id="chat-input"
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ex. licenciement abusif, clause de non-concurrence…"
            className="max-h-40 min-h-[40px] w-full flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <div>
              <label htmlFor="search-method" className="sr-only">
                Méthode de recherche
              </label>
              <select
                id="search-method"
                value={method}
                onChange={(e) => onMethodChange(e.target.value as SearchMethod)}
                disabled={disabled}
                title={currentHint}
                className="h-10 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {SEARCH_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              aria-label="Lancer la recherche"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {disabled ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-pulse" />
              ) : (
                <SendIcon />
              )}
            </button>
          </div>
        </div>
        <p className="mt-1.5 hidden px-2 text-xs text-slate-400 sm:block">
          Entrée pour envoyer, Maj + Entrée pour un retour à la ligne.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* LayoutPage (parent)                                                        */
/* -------------------------------------------------------------------------- */

export default function LayoutPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [searchMethod, setSearchMethod] = useState<SearchMethod>("Hybrid");
  const [loading, setLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<{ text: string; method: SearchMethod } | null>(null);

  // Cancel any in-flight request when the page unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runSearch = useCallback(async (text: string, method: SearchMethod) => {
    lastRequestRef.current = { text, method };
    setError(null);
    setLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await searchCases(text, method, controller.signal);

      const reply: Message = {
        id: makeId(),
        sender: "assistant",
        text: result.cases.length
          ? result.cases.length === 1
            ? "J'ai trouvé une affaire correspondant à votre recherche. Sélectionnez-la pour la retenir."
            : `J'ai trouvé ${result.cases.length} affaires correspondant à votre recherche. Sélectionnez celle qui vous intéresse.`
          : (result.message ?? "Pas d'affaire trouvée."),
        cases: result.cases.length ? result.cases : undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof ApiError
          ? err.message
          : "Une erreur inattendue est survenue. Veuillez réessayer.",
      );
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      const userMessage: Message = {
        id: makeId(),
        sender: "user",
        text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      void runSearch(text, searchMethod);
    },
    [runSearch, searchMethod],
  );

  const handleRetry = useCallback(() => {
    const last = lastRequestRef.current;
    if (last && !loading) void runSearch(last.text, last.method);
  }, [loading, runSearch]);

  const handleSelectCase = useCallback((item: CaseItem) => {
    setSelectedCase((current) => (current?.id === item.id ? null : item));
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900 antialiased">
      <Header selectedCase={selectedCase} onClearSelection={() => setSelectedCase(null)} />

      <MessageList
        messages={messages}
        loading={loading}
        selectedId={selectedCase?.id ?? null}
        onSelectCase={handleSelectCase}
      />

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={lastRequestRef.current ? handleRetry : undefined}
        />
      )}

      <ChatInput
        method={searchMethod}
        onMethodChange={setSearchMethod}
        onSubmit={handleSend}
        disabled={loading}
      />
    </div>
  );
}

// Named exports for the sub-components, in case you want to split them into files later.
export { Header, MessageList, CaseSelector, ChatInput };