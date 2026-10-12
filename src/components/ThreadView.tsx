import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/forum/auth-context";
import { categoryLabel, type Reply, type Thread } from "../lib/forum/types";
import { LIMITS, formatAgo, validateReply, validateThreadBody, validateTitle } from "../lib/forum/validation";

const edited = (created: string, updated: string) => Date.parse(updated) - Date.parse(created) > 5000;

interface Props {
  threadId: string;
  onBack: () => void;
  onLogin: () => void;
}

/** One thread: the original post, its replies, and the forms to reply, edit and delete. */
export function ThreadView({ threadId, onBack, onLogin }: Props) {
  const { backend, session } = useAuth();
  const [data, setData] = useState<{ thread: Thread; replies: Reply[] } | "missing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingThread, setEditingThread] = useState(false);
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    backend.getThread(threadId).then(
      (result) => {
        if (cancelled) return;
        setData(result ?? "missing");
        setError(null);
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load this thread."),
    );
    return () => {
      cancelled = true;
    };
  }, [backend, threadId, version]);

  if (!backend) return null;
  if (error) {
    return (
      <div>
        <button className="btn btn-ghost" onClick={onBack}>
          ← All threads
        </button>
        <p className="error-message">
          {error}{" "}
          <button className="link" onClick={reload}>
            Try again
          </button>
        </p>
      </div>
    );
  }
  if (!data) return <p className="muted">Loading the thread…</p>;
  if (data === "missing") {
    return (
      <div>
        <button className="btn btn-ghost" onClick={onBack}>
          ← All threads
        </button>
        <p className="muted">This thread doesn't exist any more.</p>
      </div>
    );
  }

  const { thread, replies } = data;
  const isMod = !!session?.profile?.isAdmin;
  const mine = (authorId: string) => session?.userId === authorId;
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Please try again.");
    }
  };

  return (
    <div className="thread-view">
      <button className="btn btn-ghost" onClick={onBack}>
        ← All threads
      </button>

      <article className="card post">
        {editingThread ? (
          <EditThreadForm
            thread={thread}
            onCancel={() => setEditingThread(false)}
            onSave={async (title, body) => {
              await backend.updateThread(thread.id, { title, body });
              setEditingThread(false);
              reload();
            }}
          />
        ) : (
          <>
            <p className="eyebrow">
              {categoryLabel(thread.category)}
              {thread.pinned ? " · pinned" : ""}
              {thread.locked ? " · locked" : ""}
            </p>
            <h2>{thread.title}</h2>
            <p className="post-meta muted small">
              {thread.authorName} · {formatAgo(thread.createdAt)}
              {edited(thread.createdAt, thread.updatedAt) ? " · edited" : ""}
            </p>
            <p className="post-body">{thread.body}</p>
            <div className="post-actions">
              {(mine(thread.authorId) || isMod) && (
                <>
                  <button className="link" onClick={() => setEditingThread(true)}>
                    Edit
                  </button>
                  <button
                    className="link"
                    onClick={() => {
                      if (window.confirm("Delete this thread and all its replies?")) void run(async () => { await backend.deleteThread(thread.id); onBack(); });
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
              {isMod && (
                <>
                  <button className="link" onClick={() => void run(() => backend.setThreadFlags(thread.id, { pinned: !thread.pinned }))}>
                    {thread.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button className="link" onClick={() => void run(() => backend.setThreadFlags(thread.id, { locked: !thread.locked }))}>
                    {thread.locked ? "Unlock" : "Lock"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </article>

      <h3 className="replies-heading">
        {replies.length} {replies.length === 1 ? "reply" : "replies"}
      </h3>
      <ul className="reply-list">
        {replies.map((r) => (
          <li key={r.id} className="card post">
            {editingReply === r.id ? (
              <EditReplyForm
                reply={r}
                onCancel={() => setEditingReply(null)}
                onSave={async (body) => {
                  await backend.updateReply(r.id, body);
                  setEditingReply(null);
                  reload();
                }}
              />
            ) : (
              <>
                <p className="post-meta muted small">
                  <strong>{r.authorName}</strong> · {formatAgo(r.createdAt)}
                  {edited(r.createdAt, r.updatedAt) ? " · edited" : ""}
                </p>
                <p className="post-body">{r.body}</p>
                {(mine(r.authorId) || isMod) && (
                  <div className="post-actions">
                    <button className="link" onClick={() => setEditingReply(r.id)}>
                      Edit
                    </button>
                    <button
                      className="link"
                      onClick={() => {
                        if (window.confirm("Delete this reply?")) void run(() => backend.deleteReply(r.id));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {thread.locked && !isMod ? (
        <p className="muted">This thread is locked, so it can't take new replies.</p>
      ) : session ? (
        <ReplyForm
          onSend={async (body) => {
            await backend.createReply(thread.id, body);
            reload();
          }}
        />
      ) : (
        <p>
          <button className="link" onClick={onLogin}>
            Log in
          </button>{" "}
          to reply.
        </p>
      )}
    </div>
  );
}

function ReplyForm({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateReply(body);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await onSend(body);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post your reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card reply-form" onSubmit={submit} noValidate>
      <label htmlFor="reply-body">Your reply</label>
      <textarea id="reply-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={LIMITS.replyMax} />
      <span className="muted small">
        {body.length.toLocaleString()} / {LIMITS.replyMax.toLocaleString()}
      </span>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Posting…" : "Post reply"}
      </button>
    </form>
  );
}

function EditThreadForm({ thread, onSave, onCancel }: { thread: Thread; onSave: (title: string, body: string) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(thread.title);
  const [body, setBody] = useState(thread.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateTitle(title) ?? validateThreadBody(body);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await onSave(title, body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your changes.");
      setBusy(false);
    }
  }

  return (
    <form className="thread-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="edit-title">Title</label>
        <input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.titleMax} />
      </div>
      <div className="field">
        <label htmlFor="edit-body">Post</label>
        <textarea id="edit-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={LIMITS.threadBodyMax} />
      </div>
      {error && <p className="error-message">{error}</p>}
      <div className="post-actions">
        <button className="btn btn-primary" disabled={busy}>
          Save
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditReplyForm({ reply, onSave, onCancel }: { reply: Reply; onSave: (body: string) => Promise<void>; onCancel: () => void }) {
  const [body, setBody] = useState(reply.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateReply(body);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await onSave(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your changes.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={LIMITS.replyMax} aria-label="Edit your reply" />
      {error && <p className="error-message">{error}</p>}
      <div className="post-actions">
        <button className="btn btn-primary" disabled={busy}>
          Save
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
