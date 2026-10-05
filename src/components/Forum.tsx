import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/forum/auth-context";
import { CATEGORIES, categoryLabel, type CategoryId, type Thread } from "../lib/forum/types";
import { LIMITS, formatAgo, validateThreadBody, validateTitle } from "../lib/forum/validation";
import { ThreadView } from "./ThreadView";

const PAGE_SIZE = 20;

interface Props {
  /** The open thread (from the address), or null for the list. */
  threadId: string | null;
  onOpenThread: (id: string | null) => void;
  onLogin: () => void;
}

/** Feedback and discussion: a list of threads by category, a form to start one, and each thread's replies. */
export function Forum({ threadId, onOpenThread, onLogin }: Props) {
  const { status, backend, session } = useAuth();
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ threads: Thread[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [version, setVersion] = useState(0); // bump to reload the list

  useEffect(() => {
    if (!backend || threadId) return;
    let cancelled = false;
    backend.listThreads({ category: category === "all" ? undefined : category, page, pageSize: PAGE_SIZE }).then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the forum."),
    );
    return () => {
      cancelled = true;
    };
  }, [backend, category, page, threadId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  if (status === "loading") return <p className="muted">Loading the forum…</p>;
  if (status === "off" || !backend) return <ForumSetup />;

  if (threadId) {
    return (
      <ThreadView
        threadId={threadId}
        onBack={() => {
          onOpenThread(null);
          reload();
        }}
        onLogin={onLogin}
      />
    );
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="forum">
      <div className="forum-head">
        <div>
          <h2>Community</h2>
          <p className="muted">Share feedback, report problems, ask for features and talk chess.</p>
        </div>
        {session ? (
          <button className="btn btn-primary" onClick={() => setComposing((c) => !c)}>
            {composing ? "Cancel" : "New thread"}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onLogin}>
            Log in to post
          </button>
        )}
      </div>

      {composing && session && (
        <NewThreadForm
          defaultCategory={category === "all" ? "feedback" : category}
          onCreated={(t) => {
            setComposing(false);
            onOpenThread(t.id);
          }}
        />
      )}

      <div className="chips" role="group" aria-label="Category">
        {(["all", ...CATEGORIES.map((c) => c.id)] as const).map((c) => (
          <button
            key={c}
            className={`chip${category === c ? " chip-on" : ""}`}
            onClick={() => {
              setCategory(c);
              setPage(0);
            }}
          >
            {c === "all" ? "All" : categoryLabel(c)}
          </button>
        ))}
      </div>

      {error && (
        <p className="error-message">
          {error}{" "}
          <button className="link" onClick={reload}>
            Try again
          </button>
        </p>
      )}
      {!data && !error && <p className="muted">Loading threads…</p>}
      {data && data.threads.length === 0 && <p className="muted">No threads here yet. Be the first to start one.</p>}
      {data && data.threads.length > 0 && (
        <ul className="thread-list">
          {data.threads.map((t) => (
            <li key={t.id}>
              <button className="thread-row" onClick={() => onOpenThread(t.id)}>
                <span className="thread-title">
                  {t.pinned && <span className="tag">pinned</span>}
                  {t.locked && <span className="tag">locked</span>}
                  {t.title}
                </span>
                <span className="thread-meta muted small">
                  <span className="tag">{categoryLabel(t.category)}</span> {t.authorName} · {formatAgo(t.createdAt)} · {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
                  {t.replyCount > 0 ? ` · last activity ${formatAgo(t.lastActivityAt)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="pager">
          <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ← Newer
          </button>
          <span className="muted small">
            Page {page + 1} of {pages}
          </span>
          <button className="btn btn-ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            Older →
          </button>
        </div>
      )}
    </div>
  );
}

function NewThreadForm({ defaultCategory, onCreated }: { defaultCategory: CategoryId; onCreated: (t: Thread) => void }) {
  const { backend } = useAuth();
  const [category, setCategory] = useState<CategoryId>(defaultCategory);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!backend) return;
    const problem = validateTitle(title) ?? validateThreadBody(body);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      onCreated(await backend.createThread({ category, title, body }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post your thread.");
      setBusy(false);
    }
  }

  return (
    <form className="card thread-form" onSubmit={submit} noValidate>
      <h3>Start a thread</h3>
      <div className="field">
        <label htmlFor="thread-category">Category</label>
        <select id="thread-category" value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}: {c.hint}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="thread-title">Title</label>
        <input id="thread-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.titleMax} />
      </div>
      <div className="field">
        <label htmlFor="thread-body">Post</label>
        <textarea id="thread-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={LIMITS.threadBodyMax} />
        <span className="muted small">
          {body.length.toLocaleString()} / {LIMITS.threadBodyMax.toLocaleString()}
        </span>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Posting…" : "Post thread"}
      </button>
    </form>
  );
}

/** Shown when the site has no Supabase project configured: what to do about it. */
function ForumSetup() {
  return (
    <div className="card forum-setup">
      <h2>Community isn't set up yet</h2>
      <p>The forum and login need a free Supabase project. Create one, run the SQL in <code>supabase/schema.sql</code>, and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>. The steps are in <code>docs/forum-setup.md</code>.</p>
      <p className="muted small">To try the screens now without a project, start the dev server with <code>VITE_FORUM_MOCK=1 npm run dev</code>.</p>
    </div>
  );
}
