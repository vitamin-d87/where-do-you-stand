import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Upload,
  Users,
  SlidersHorizontal,
  Monitor,
  Copy,
  Download,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  LogOut,
  Trash2,
  RefreshCw,
  Sparkles,
  Lock,
  MoveRight,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import {
  questions,
  groups,
  colors,
  shuffle,
  validAnswers,
  stackAtSlots,
  insight,
  csv,
  type Participant,
  type EventInfo,
} from "./data";
import { api, supabase, demo, download, preparePhoto, resetDemo } from "./api";
import { TeamTeethLogo } from "./TeamTeethLogo";
import { SelfieCamera } from "./SelfieCamera";
import { OrganiserPassword } from "./OrganiserPassword";
import { signInError } from "./authErrors";
import "./style.css";
const base = () => location.origin + location.pathname + location.search;
function useRoute() {
  const [route, set] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const fn = () => set(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  return route;
}
function Brand() {
  return (
    <a className="brand" href="#/">
      <TeamTeethLogo />
      <span className="brand-wordmark">
        Where Do You Stand<span className="brand-q">?</span>
        <small>TEAM TEETH</small>
      </span>
    </a>
  );
}
function Avatar({
  p,
  index = 0,
}: {
  p: Pick<Participant, "name" | "photo">;
  index?: number;
}) {
  return (
    <span
      className="avatar"
      style={{ "--person": colors[index % colors.length] } as CSSProperties}
    >
      {p.photo ? (
        <img src={p.photo} alt="" />
      ) : (
        p.name
          .trim()
          .split(/\s+/)
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      )}
    </span>
  );
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
export function App() {
  const route = useRoute();
  return (
    <>
      <div className="app-top">
        <Brand />
        <div className="top-right">
          {demo && <span className="demo-pill">● Fictional demo</span>}
          <a href="#/admin">
            <Lock size={14} /> Organiser
          </a>
        </div>
      </div>
      {route.startsWith("/admin") || route.startsWith("/present") ? (
        <Admin present={route.startsWith("/present")} />
      ) : (
        <Survey key={route.split("?")[0]} route={route} />
      )}
      <footer className="site-footer">
        A little curiosity. A lot of connection.
        <span>For conversation, not assessment.</span>
      </footer>
    </>
  );
}
type Draft = {
  name: string;
  photo?: string;
  answers: Record<string, number>;
  order: string[];
  receipt: string;
  submitted: boolean;
  consent: boolean;
};
function Survey({ route }: { route: string }) {
  const match = route.match(/^\/join\/([^?]+)/);
  const eventId = match?.[1] || "demo";
  const invite = new URLSearchParams(route.split("?")[1]).get("invite") || "";
  const storageKey = `wdys-draft-${eventId}-${demo ? "demo" : "live"}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {
      /* Fresh draft if unavailable. */
    }
    return {
      name: "",
      answers: {},
      order: shuffle(questions.map((q) => q.id)),
      receipt: crypto.randomUUID() + crypto.randomUUID(),
      submitted: false,
      consent: false,
    };
  });
  const [step, setStep] = useState(-2);
  const [event, setEvent] = useState<EventInfo>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File>();
  const [zoom, setZoom] = useState(1);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      setError(
        "This browser cannot save your draft. Keep this tab open until submission.",
      );
    }
  }, [draft, storageKey]);
  useEffect(() => {
    api("status", { eventId, invite })
      .then((d) => setEvent(d.event as EventInfo))
      .catch((e) => setError(e.message));
  }, [eventId, invite]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setPhotoBusy(true);
    preparePhoto(file, zoom)
      .then((photo) => {
        if (!cancelled) setDraft((d) => ({ ...d, photo }));
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setPhotoBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, zoom]);
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  async function submit() {
    if (!validAnswers(draft.answers) || !draft.consent) return;
    setBusy(true);
    setError("");
    try {
      await api("submit", {
        eventId,
        invite,
        receipt: draft.receipt,
        consent: draft.consent,
        name: draft.name.trim(),
        answers: draft.answers,
        photo: draft.photo,
      });
      patch({ submitted: true });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not submit. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  const q = questions.find((q) => q.id === draft.order[step]);
  if (draft.submitted)
    return (
      <main className="survey-shell success">
        <div className="success-mark">
          <Check size={40} />
        </div>
        <p className="eyebrow">YOU’RE ALL SET</p>
        <h1>
          That’s where you stand,
          <br />
          {draft.name}.
        </h1>
        <p>
          Your responses are in. We’ll reveal the team’s results together in the
          session — there are a few good conversations ahead.
        </p>
        <button
          className="secondary"
          onClick={() => {
            patch({ submitted: false });
            setStep(12);
          }}
        >
          Review or correct my response
        </button>
        <small>
          Corrections replace your existing response from this tab. On another
          device, ask your organiser to remove the original.
        </small>
        {demo && (
          <a className="text-link" href="#/admin">
            Explore the demo dashboard <ArrowRight size={16} />
          </a>
        )}
      </main>
    );
  if (step === -2)
    return (
      <main className="welcome">
        <section className="welcome-copy">
          <p className="eyebrow">
            <span className="tiny-dot" /> A TEAM ACTIVITY WITH A LITTLE
            PERSONALITY
          </p>
          <h1>
            Different people.
            <br />
            Different instincts.
            <br />
            <em>One team.</em>
          </h1>
          <p className="intro-title">Where Do You Stand?</p>
          <p className="intro">
            Discover how we think, connect and get things done. Twelve quick
            questions, no right or wrong answers!
          </p>
          <button
            className="primary large"
            disabled={!event || !event.open}
            onClick={() => setStep(-1)}
          >
            Let’s go! <ArrowRight size={20} />
          </button>
          <span className="time">
            3–4 minutes · 12 sliders · Just be yourself
          </span>
          {event && !event.open && (
            <ErrorBox message="The survey is closed. Please check with your organiser." />
          )}
          <ErrorBox message={error} />
          {error && !event && (
            <button onClick={() => location.reload()} className="secondary">
              Retry connection
            </button>
          )}
          {demo && (
            <a className="text-link" href="#/present">
              Take a look at the team demo <MoveRight size={17} />
            </a>
          )}
        </section>
        <section
          className="welcome-art"
          aria-label="An illustration of different preferences on three spectrums"
        >
          <div className="art-caption">
            <Sparkles size={16} /> SAME TEAM. DIFFERENT PERSPECTIVES.
          </div>
          {["Think it through", "Talk it out", "Make it happen"].map((t, i) => (
            <div className={`art-card art-${i}`} key={t}>
              <span>
                0{i + 1} / {["THE THINKERS", "THE CONNECTORS", "THE DOERS"][i]}
              </span>
              <h2>
                {t}
                <span>↗</span>
              </h2>
              <div className="art-line">
                {[0, 1, 2].map((n) => (
                  <span
                    className="art-dot"
                    key={n}
                    style={{
                      left: `${15 + n * 31 + i * 4}%`,
                      background: colors[(i * 2 + n) % 8],
                    }}
                  >
                    {["A", "P", "S", "M", "N", "J", "R", "T"][(i * 2 + n) % 8]}
                  </span>
                ))}
              </div>
              <p>
                {
                  [
                    "A bit of curiosity goes a long way.",
                    "Find your kind of connection.",
                    "There’s more than one way to get there.",
                  ][i]
                }
              </p>
            </div>
          ))}
          <span className="art-spark">✳</span>
        </section>
      </main>
    );
  return (
    <main className="survey-shell">
      <div className="survey-meta">
        <span>
          {step === -1
            ? "FIRST, A QUICK HELLO"
            : step === 12
              ? "ONE LAST LOOK"
              : `QUESTION ${step + 1} OF 12`}
        </span>
        <span>
          {step >= 0 && step < 12
            ? `${Math.round((step / 12) * 100)}% complete`
            : "YOUR TEAM, YOUR WAY"}
        </span>
      </div>
      <div className="progress">
        <i
          style={{
            width: `${step === -1 ? 0 : step === 12 ? 100 : (step / 12) * 100}%`,
          }}
        />
      </div>
      <ErrorBox message={error} />
      {step === -1 ? (
        <section className="question-page">
          <h1 ref={heading} tabIndex={-1}>
            Let’s put a name
            <br />
            to that perspective.
          </h1>
          <p>First name, nickname, the name you go by.</p>
          <label className="field-label" htmlFor="name">
            Your display name
          </label>
          <input
            id="name"
            autoComplete="given-name"
            maxLength={32}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="e.g. Alex"
          />
          <div className="photo-row">
            <Avatar p={draft} />
            <div>
              <b>A face to go with your name?</b>
              <p>Optional. A clear selfie works beautifully.</p>
              <div className="photo-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setError("");
                    setCameraOpen(true);
                  }}
                >
                  Take photo
                </button>
                <label className="secondary">
                  <Upload size={16} /> Upload
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      setFile(e.target.files?.[0]);
                      setZoom(1);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
          {cameraOpen && (
            <SelfieCamera
              onClose={() => setCameraOpen(false)}
              onCapture={(photo) => {
                setFile(photo);
                setZoom(1);
                setError("");
                setCameraOpen(false);
              }}
            />
          )}
          {draft.photo && !file && (
            <button
              className="text-link"
              onClick={() => patch({ photo: undefined })}
            >
              Remove photo
            </button>
          )}
          {file && (
            <div className="crop">
              <label>
                Centre crop · zoom
                <input
                  aria-label="Photo crop zoom"
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
              <span>Preview above · {photoBusy ? "Preparing…" : "Ready"}</span>
              <button
                className="text-link"
                onClick={() => {
                  setFile(undefined);
                  patch({ photo: undefined });
                }}
              >
                Remove photo
              </button>
            </div>
          )}
          <div className="privacy">
            <Lock size={17} />
            <div>
              <b>A little about your privacy</b>
              <p>
                Your organiser and colleagues will see your name, optional
                portrait and answers on the team screen. Taking part and adding
                a photo are voluntary. This is a conversation starter, not a
                personality test.
              </p>
              <p>
                Responses and photos are due for deletion{" "}
                {event
                  ? new Date(
                      new Date(event.created_at).getTime() +
                        event.retention_days * 86400000,
                    ).toLocaleDateString("en-GB")
                  : "30 days after the event is created"}
                . Ask your organiser to correct or remove your entry. Your draft
                stays in this browser tab until you close it.
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={draft.consent}
                  onChange={(e) => patch({ consent: e.target.checked })}
                />{" "}
                I’m happy to share my responses with the team.
              </label>
            </div>
          </div>
          <div className="survey-nav">
            <button className="text-link" onClick={() => setStep(-2)}>
              <ArrowLeft size={17} /> Back
            </button>
            <button
              className="primary"
              disabled={!draft.name.trim() || !draft.consent || photoBusy}
              onClick={() => setStep(0)}
            >
              On to the questions <ArrowRight size={17} />
            </button>
          </div>
        </section>
      ) : step === 12 ? (
        <section className="question-page">
          <p className="eyebrow">A SNAPSHOT OF YOU</p>
          <h1 ref={heading} tabIndex={-1}>
            Does this feel like you?
          </h1>
          <p>Check your positions below. Tap any answer to change it.</p>
          <div className="review-list">
            {draft.order.map((id, i) => {
              const item = questions.find((q) => q.id === id)!;
              return (
                <button
                  key={id}
                  className="review-item"
                  onClick={() => setStep(i)}
                >
                  <span>{item.prompt}</span>
                  <span className="mini-spectrum">
                    <i style={{ left: `${(draft.answers[id] / 24) * 100}%` }} />
                  </span>
                  <span>Edit ↗</span>
                </button>
              );
            })}
          </div>
          <p className="small muted">
            The middle means “a bit of both”. Once submitted, you can correct
            your response from this tab.
          </p>
          <div className="survey-nav">
            <button
              className="text-link"
              disabled={busy}
              onClick={() => setStep(11)}
            >
              <ArrowLeft size={17} /> Back
            </button>
            <button
              className="primary"
              disabled={busy || !validAnswers(draft.answers)}
              onClick={submit}
            >
              {busy ? "Sending…" : "Submit my responses"} <Check size={18} />
            </button>
          </div>
        </section>
      ) : (
        q && (
          <section className="question-page" key={q.id}>
            <p className="eyebrow">{q.theme}</p>
            <h1 className="question-prompt" ref={heading} tabIndex={-1}>
              {q.prompt}
            </h1>
            <p>Go with your instinct. Anywhere along the line is fine.</p>
            <div className="spectrum-endpoints" id="endpoints">
              <strong>{q.left}</strong>
              <strong>{q.right}</strong>
            </div>
            <div
              className={`slider-wrap ${draft.answers[q.id] === undefined ? "unanswered" : ""}`}
            >
              <input
                aria-label={q.prompt}
                aria-describedby="endpoints slider-help"
                aria-valuetext={
                  draft.answers[q.id] === undefined
                    ? "Not answered"
                    : draft.answers[q.id] === 12
                      ? "A bit of both"
                      : `${Math.round((draft.answers[q.id] / 24) * 100)}% towards: ${q.right}`
                }
                type="range"
                min={0}
                max={24}
                step={1}
                value={draft.answers[q.id] ?? 12}
                onChange={(e) =>
                  patch({
                    answers: {
                      ...draft.answers,
                      [q.id]: Number(e.target.value),
                    },
                  })
                }
                onPointerUp={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const value = Math.max(
                    0,
                    Math.min(
                      24,
                      Math.round(
                        ((e.clientX - r.left - 14) / (r.width - 28)) * 24,
                      ),
                    ),
                  );
                  patch({ answers: { ...draft.answers, [q.id]: value } });
                }}
                onKeyDown={(e) => {
                  if (["Enter", " "].includes(e.key)) {
                    e.preventDefault();
                    patch({
                      answers: {
                        ...draft.answers,
                        [q.id]: draft.answers[q.id] ?? 12,
                      },
                    });
                  }
                }}
              />
              <div className="slider-ticks">
                {Array.from({ length: 7 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
            <button
              className={`midpoint ${draft.answers[q.id] === 12 ? "selected" : ""}`}
              onClick={() =>
                patch({ answers: { ...draft.answers, [q.id]: 12 } })
              }
            >
              A bit of both
            </button>
            <span id="slider-help" className="sr-only">
              Use arrow keys to move. Press Enter or Space to choose the middle.
            </span>
            <p className="slider-hint" aria-live="polite">
              {draft.answers[q.id] === undefined
                ? "Move the slider, or tap “A bit of both” to choose."
                : draft.answers[q.id] === 12
                  ? "A little of each. Makes sense."
                  : draft.answers[q.id] < 12
                    ? "Leaning towards the left. Got it."
                    : "Leaning towards the right. Got it."}
            </p>
            <div className="survey-nav">
              <button className="text-link" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={17} /> Back
              </button>
              <button
                className="primary"
                disabled={draft.answers[q.id] === undefined}
                onClick={() => setStep(step + 1)}
              >
                {step === 11 ? "Review answers" : "Next question"}{" "}
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )
      )}
    </main>
  );
}
function Admin({ present }: { present: boolean }) {
  const [authorised, setAuthorised] = useState(demo);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [passwordMode, setPasswordMode] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [event, setEvent] = useState<EventInfo>();
  const [people, setPeople] = useState<Participant[]>([]);
  const [link, setLink] = useState(() => (demo ? base() + "#/join/demo" : ""));
  const [qr, setQr] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [failure, setFailure] = useState(
    localStorage.getItem("wdys-fail") || "",
  );
  const load = useCallback(async () => {
    try {
      const d = await api("list");
      setAuthorised(true);
      setEvent(d.event as EventInfo | undefined);
      setPeople((d.people as Participant[]) || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    }
  }, []);
  useEffect(() => {
    if (demo) {
      void load();
      return;
    }
    void supabase!.auth.getSession().then(({ data }) => {
      if (data.session) void load();
    });
    const { data } = supabase!.auth.onAuthStateChange((_ev, session) => {
      if (session) void load();
      else setAuthorised(false);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);
  useEffect(() => {
    if (!authorised) return;
    const timer = setInterval(load, 15000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [authorised, load]);
  useEffect(() => {
    if (link)
      void QRCode.toDataURL(link, {
        width: 640,
        margin: 2,
        color: { dark: "#202c2c", light: "#ffffff" },
      }).then(setQr);
  }, [link]);
  async function action(name: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const d = await api(name, payload);
      if (d.invite) setLink(base() + `#/join/${d.eventId}?invite=${d.invite}`);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function login() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const address = email.trim().toLowerCase();
      if (passwordMode) {
        const { error } = await supabase!.auth.signInWithPassword({
          email: address,
          password,
        });
        if (error) throw error;
        setPassword("");
        await load();
      } else if (sent) {
        const { error } = await supabase!.auth.verifyOtp({
          email: address,
          token: otp,
          type: "email",
        });
        if (error) throw error;
        await load();
      } else {
        const { error } = await supabase!.auth.signInWithOtp({
          email: address,
          options: { shouldCreateUser: false },
        });
        if (error) throw error;
        setSent(true);
        setNotice("Check your email for the sign-in code.");
      }
    } catch (e) {
      setError(signInError(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Participant link copied.");
    } catch {
      setNotice("Select and copy the participant link below.");
    }
  }
  if (!authorised)
    return (
      <main className="survey-shell login">
        <span className="section-icon">
          <Lock />
        </span>
        <p className="eyebrow">FOR THE PERSON BRINGING EVERYONE TOGETHER</p>
        <h1>Organiser sign-in</h1>
        <p>
          Use the email authorised for this survey. Sign in with an email code,
          or use a survey password if you have already set one.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <label className="field-label">
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={sent}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {passwordMode && (
            <label className="field-label">
              Survey password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {sent && !passwordMode && (
            <label className="field-label">
              Email code
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </label>
          )}
          <ErrorBox message={error} />
          <p role="status">{notice}</p>
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : sent || passwordMode
                ? "Sign in"
                : "Email me a code"}{" "}
            <ArrowRight size={17} />
          </button>
          {sent && !passwordMode && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setSent(false);
                setOtp("");
                setNotice("");
                setError("");
              }}
            >
              Use another email / resend
            </button>
          )}
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => {
              setPasswordMode(!passwordMode);
              setSent(false);
              setOtp("");
              setPassword("");
              setNotice("");
              setError("");
            }}
          >
            {passwordMode
              ? "Use an email code instead"
              : "Use a survey password instead"}
          </button>
          {passwordMode && (
            <p className="small muted">
              This is the password set for this survey, which may differ from
              your Supabase dashboard password. First-time organisers need an
              email code; after signing in, you can set a survey password.
            </p>
          )}
        </form>
      </main>
    );
  if (present && event)
    return <Presentation people={people} event={event} error={error} />;
  return (
    <main className="dashboard">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">A GOOD CONVERSATION STARTS HERE</p>
          <h1>Your team, at a glance.</h1>
          <p className="muted">
            A few different perspectives. Plenty to talk about.
          </p>
        </div>
        <a className="primary" href="#/present">
          <Monitor size={18} /> Open presentation <ArrowRight size={18} />
        </a>
      </div>
      <ErrorBox message={error} />
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {!event ? (
        <section className="panel">
          <h2>Create your team session</h2>
          <p>
            Start with eight people and 30-day retention. You can adjust both
            below.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => action("create")}
          >
            Create session
          </button>
        </section>
      ) : (
        <>
          <div className="stat-grid">
            <section className="stat-card">
              <span className="stat-icon">
                <Users size={21} />
              </span>
              <span className="eyebrow">THE TEAM IS TAKING SHAPE</span>
              <div className="big-stat">
                {people.length}
                <span> / {event.expected}</span>
              </div>
              <p>responses received</p>
              <div className="progress">
                <i
                  style={{
                    width: `${Math.min(100, (people.length / event.expected) * 100)}%`,
                  }}
                />
              </div>
            </section>
            <section className="stat-card">
              <span className={`status-dot ${event.open ? "" : "closed"}`} />
              <span className="eyebrow">SURVEY STATUS</span>
              <h2>{event.open ? "Come on in." : "Taking a pause."}</h2>
              <p>
                {event.open
                  ? "Your team can submit and correct responses."
                  : "New submissions and corrections are paused."}
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => action("settings", { open: !event.open })}
              >
                {event.open ? "Close survey" : "Reopen survey"}{" "}
                <ArrowRight size={16} />
              </button>
            </section>
            <section className="stat-card sharing">
              <span className="eyebrow">INVITE A LITTLE CURIOSITY</span>
              <h2>Bring everyone in.</h2>
              <p>One link. Twelve quick questions.</p>
              {link ? (
                <>
                  <div className="button-row">
                    <button className="secondary" onClick={copy}>
                      <Copy size={15} /> Copy link
                    </button>
                    <button
                      className="icon-button"
                      title="Download QR code"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = qr;
                        a.download = "where-do-you-stand-qr.png";
                        a.click();
                      }}
                    >
                      <Download size={17} />
                    </button>
                  </div>
                  <img
                    className="qr"
                    src={qr}
                    alt="Participant invitation QR code"
                  />
                  <input
                    className="share-link"
                    aria-label="Participant link"
                    readOnly
                    value={link}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    className="text-link small"
                    disabled={busy}
                    onClick={() => setConfirm("rotate")}
                  >
                    Replace invitation
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setConfirm("rotate")}
                  >
                    Generate new invitation
                  </button>
                  <small>
                    The invitation is only displayed when generated.
                    Regenerating replaces any earlier link.
                  </small>
                </>
              )}
            </section>
          </div>
          <section className="panel participant-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">READY FOR THE REVEAL</p>
                <h2>Meet your perspectives.</h2>
              </div>
              <div className="button-row">
                <span className="small muted">Refreshes every 15 seconds</span>
                <button
                  className="icon-button"
                  aria-label="Refresh responses"
                  onClick={load}
                >
                  <RefreshCw size={17} />
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      "team-responses.csv",
                      csv(people),
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  <Download size={16} /> Export CSV
                </button>
              </div>
            </div>
            <div className="participant-grid">
              {people.map((p, i) => (
                <div className="participant-card" key={p.id}>
                  <Avatar p={p} index={i} />
                  <div>
                    <b>{p.name}</b>
                    <span>
                      <Check size={12} /> Response received
                    </span>
                  </div>
                  <button
                    className="icon-button remove"
                    aria-label={`Remove ${p.name}`}
                    disabled={busy}
                    onClick={() => {
                      setDeleteId(p.id);
                      setConfirm("remove");
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {!people.length && (
              <p className="empty">
                The first perspective is on its way. Share the invitation to get
                started.
              </p>
            )}
          </section>
          <div className="dashboard-bottom">
            <section className="panel session-settings">
              <h3>Session settings</h3>
              <label>
                Expected participants
                <input
                  aria-label="Expected participants"
                  type="number"
                  min="1"
                  max="64"
                  defaultValue={event.expected}
                  key={`expected-${event.expected}`}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== event.expected && v >= 1 && v <= 64)
                      void action("settings", { expected: v });
                  }}
                />
              </label>
              <label>
                Retention period (days from session creation)
                <input
                  aria-label="Retention days"
                  type="number"
                  min="1"
                  max="90"
                  defaultValue={event.retention_days}
                  key={`retention-${event.retention_days}`}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== event.retention_days && v >= 1 && v <= 90) {
                      if (
                        Date.now() >=
                        Date.parse(event.created_at) + v * 86400000
                      ) {
                        setError(
                          "That retention period has already elapsed. Use Delete all responses to erase the session, or choose a future deletion date.",
                        );
                        e.target.value = String(event.retention_days);
                      } else void action("settings", { retention_days: v });
                    }
                  }}
                />
              </label>
              <small>
                Due for deletion:{" "}
                {new Date(
                  new Date(event.created_at).getTime() +
                    event.retention_days * 86400000,
                ).toLocaleDateString("en-GB")}
                . Scheduled cleanup must be enabled during setup.
              </small>
              <button
                className="text-link danger"
                disabled={busy}
                onClick={() => setConfirm("purge")}
              >
                <Trash2 size={15} /> Delete all responses and photographs
              </button>
            </section>
            <section className="panel presentation-callout">
              <span className="section-icon">
                <Sparkles />
              </span>
              <h2>Time for the interesting bit.</h2>
              <p>
                Three themes. Four spectrums each. Let’s see what makes this
                team tick.
              </p>
              <a className="text-link" href="#/present">
                Let the conversations begin <ArrowRight size={18} />
              </a>
            </section>
          </div>
        </>
      )}
      <details className="panel question-catalogue">
        <summary>
          Survey questions <span>12 questions · 3 themes</span>
        </summary>
        {groups.map((group, index) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <ol start={index * 4 + 1}>
              {questions
                .filter((q) => q.group === index)
                .map((q) => (
                  <li key={q.id}>{q.prompt}</li>
                ))}
            </ol>
          </section>
        ))}
      </details>
      {demo && (
        <details className="panel demo-testing">
          <summary>
            Demo testing <SlidersHorizontal size={15} />
          </summary>
          <p>
            Fictional data only, saved in this browser. All eight people share
            the same Curiosity position to test stacking.
          </p>
          <label>
            Simulate a failure{" "}
            <select
              value={failure}
              onChange={(e) => {
                setFailure(e.target.value);
                localStorage.setItem("wdys-fail", e.target.value);
              }}
            >
              <option value="">No failure</option>
              <option value="network">Network request failure</option>
              <option value="photo">Photograph upload failure</option>
            </select>
          </label>
          <button
            className="secondary"
            onClick={() => {
              resetDemo();
              localStorage.removeItem("wdys-fail");
              setFailure("");
              void load();
            }}
          >
            Restore eight fictional colleagues
          </button>
        </details>
      )}
      {!demo && <OrganiserPassword />}
      {!demo && (
        <button className="text-link" onClick={() => supabase!.auth.signOut()}>
          <LogOut size={16} /> Sign out
        </button>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">
              {confirm === "purge"
                ? "Delete the team’s responses?"
                : confirm === "rotate"
                  ? "Replace the invitation link?"
                  : "Remove this response?"}
            </h2>
            <p>
              {confirm === "purge"
                ? "All responses and photographs will be permanently deleted. The survey will close."
                : confirm === "rotate"
                  ? "Earlier links will stop working. Share the new link with everyone who still needs to respond."
                  : "This response and its photograph will be permanently deleted. The participant can submit again."}
            </p>
            <div className="button-row">
              <button
                className="secondary"
                autoFocus
                onClick={() => setConfirm("")}
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  const ok = await action(
                    confirm === "rotate" ? "rotate" : confirm,
                    confirm === "remove" ? { id: deleteId } : {},
                  );
                  if (ok) setConfirm("");
                }}
              >
                {busy ? "Working…" : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
function Presentation({
  people,
  event,
  error,
}: {
  people: Participant[];
  event: EventInfo;
  error: string;
}) {
  const [page, setPage] = useState(-1);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [notes, setNotes] = useState(false);
  const [controls, setControls] = useState(true);
  const [gradual, setGradual] = useState(true);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,select,textarea,button"))
        return;
      if (e.key === "ArrowRight") setPage((p) => Math.min(2, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(-1, p - 1));
      if (e.key.toLowerCase() === "h") setControls((c) => !c);
      if ((e.key === " " || e.key.toLowerCase() === "r") && page >= 0) {
        e.preventDefault();
        setRevealed((r) => ({ ...r, [page]: !r[page] }));
      }
    };
    window.addEventListener("keydown", fn);
    const fs = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", fs);
    return () => {
      window.removeEventListener("keydown", fn);
      document.removeEventListener("fullscreenchange", fs);
    };
  }, [page]);
  const group = groups[page];
  const show = revealed[page];
  const stats =
    page >= 0 && show && people.length > 1 ? insight(people, page) : null;
  return (
    <div
      className={`presentation ${controls ? "" : "clean"}`}
      style={{ "--group": group?.color || "#087b73" } as CSSProperties}
    >
      <div className="presentation-top">
        <Brand />
        <span>
          {demo ? "DEMO SESSION" : event.title}{" "}
          <span className="separator">/</span> {people.length} perspectives
        </span>
        <button
          className="icon-button"
          aria-label={
            controls
              ? "Hide presentation controls"
              : "Show presentation controls"
          }
          onClick={() => setControls(!controls)}
        >
          {controls ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <ErrorBox message={error} />
      {page === -1 ? (
        <section className="presentation-welcome">
          <p className="eyebrow">SAME TEAM. DIFFERENT PERSPECTIVES.</p>
          <h1>
            Where Do
            <br />
            You <em>Stand?</em>
          </h1>
          <p>
            Twelve questions. {people.length} colleagues.
            <br />A few things you might not have guessed.
          </p>
          <div className="team-line">
            {people.map((p, i) => (
              <div key={p.id}>
                <Avatar p={p} index={i} />
                <span>{p.name}</span>
              </div>
            ))}
          </div>
          <button className="primary" onClick={() => setPage(0)}>
            Let’s find out <ArrowRight size={18} />
          </button>
          <small>A conversation starter, not a personality test.</small>
        </section>
      ) : (
        <>
          <header className="group-header">
            <div>
              <p className="eyebrow">
                0{page + 1} / THREE WAYS TO SEE OUR TEAM
              </p>
              <h1>
                {group.title}
                <span>.</span>
              </h1>
              <p>{group.subtitle}</p>
            </div>
            <div className="group-symbol">{["✳", "↔", "↗"][page]}</div>
          </header>
          <div className="spectrum-grid">
            {questions
              .filter((q) => q.group === page)
              .map((q, qi) => {
                const placed = show ? stackAtSlots(people, q.id) : [];
                const max = Math.max(
                  1,
                  ...Array.from(
                    { length: 7 },
                    (_, slot) => placed.filter((x) => x.slot === slot).length,
                  ),
                );
                return (
                  <section
                    className={`presentation-spectrum ${show ? "is-revealed" : ""} ${max > 3 ? "compact" : ""}`}
                    key={q.id}
                  >
                    <div className="spectrum-title">
                      <span>0{qi + 1}</span>
                      <h2>{q.prompt}</h2>
                    </div>
                    <div className="present-endpoints">
                      <span>{q.left}</span>
                      <span>{q.right}</span>
                    </div>
                    <div className="plot">
                      <div className="plot-line" />
                      {Array.from({ length: 7 }, (_, slot) => (
                        <div className="plot-column" key={slot}>
                          <i className="plot-tick" />
                          {show ? (
                            placed
                              .filter((x) => x.slot === slot)
                              .map(({ p }, i) => (
                                <div
                                  className={`plot-person ${gradual ? "animate-person" : ""}`}
                                  key={p.id}
                                  title={p.name}
                                  style={{
                                    animationDelay: `${people.findIndex((x) => x.id === p.id) * 90 + qi * 60}ms`,
                                  }}
                                >
                                  <Avatar
                                    p={p}
                                    index={people.findIndex(
                                      (x) => x.id === p.id,
                                    )}
                                  />
                                  <span>{p.name}</span>
                                  {i === 0 && (
                                    <span className="sr-only">
                                      Position {slot + 1} of 7
                                    </span>
                                  )}
                                </div>
                              ))
                          ) : (
                            <span
                              className="placeholder-dot"
                              style={{ animationDelay: `${slot * 110}ms` }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    {!show && (
                      <span className="waiting">
                        A few different instincts, waiting to be revealed.
                      </span>
                    )}
                  </section>
                );
              })}
          </div>
          <div className="presentation-bottom">
            {stats ? (
              <div className="insights">
                <span>
                  <Sparkles size={14} /> MOST ALIGNED <b>{stats.aligned}</b>
                </span>
                <span>
                  BIGGEST SPREAD <b>{stats.spread}</b>
                </span>
              </div>
            ) : (
              <span className="small muted">
                {show
                  ? "Every perspective is welcome."
                  : "The best part? Finding out together."}
              </span>
            )}
            <span className="page-number">0{page + 1} / 03</span>
          </div>
          {notes && (
            <aside className="facilitator">
              <b>{group.main}</b>
              <div>
                {group.prompts.map((p) => (
                  <span key={p}>• {p}</span>
                ))}
              </div>
            </aside>
          )}
        </>
      )}
      {controls && (
        <nav
          className="presentation-controls"
          aria-label="Presentation controls"
        >
          <a href="#/admin" className="text-link">
            <ArrowLeft size={15} /> Dashboard
          </a>
          <div className="button-row">
            <button
              className="icon-button"
              aria-label="Previous group"
              disabled={page < 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ArrowLeft size={17} />
            </button>
            {[-1, 0, 1, 2].map((n) => (
              <button
                key={n}
                className={`page-dot ${n === page ? "active" : ""}`}
                aria-label={n === -1 ? "Title screen" : groups[n].title}
                onClick={() => setPage(n)}
              />
            ))}
            <button
              className="icon-button"
              aria-label="Next group"
              disabled={page === 2}
              onClick={() => setPage((p) => p + 1)}
            >
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="button-row">
            {page >= 0 && (
              <>
                <label className="small">
                  <input
                    type="checkbox"
                    checked={gradual}
                    onChange={(e) => setGradual(e.target.checked)}
                  />{" "}
                  Animate
                </label>
                <button className="secondary" onClick={() => setNotes(!notes)}>
                  {notes ? "Hide" : "Show"} notes
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    setRevealed((r) => ({ ...r, [page]: !r[page] }))
                  }
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}{" "}
                  {show ? "Hide results" : "Reveal results"}
                </button>
              </>
            )}
            <button
              title="Full screen"
              className="icon-button"
              onClick={async () => {
                try {
                  if (document.fullscreenElement)
                    await document.exitFullscreen();
                  else await document.documentElement.requestFullscreen();
                } catch {
                  /* iPhone Safari: browser controls can be hidden manually. */
                }
              }}
            >
              {full ? <Minimize size={17} /> : <Maximize size={17} />}
            </button>
          </div>
        </nav>
      )}
      <span className="keyboard-hint">
        ← → navigate · R reveal · H controls
      </span>
    </div>
  );
}
