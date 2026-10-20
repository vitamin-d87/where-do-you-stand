import { useEffect, useRef, useState } from "react";
import { Camera, Check, RefreshCw, X } from "lucide-react";

function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera permission wasn’t granted. Allow camera access for this site in your browser settings, or upload a photograph instead.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "No camera was found on this device. You can upload a photograph instead.";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "The camera may be in use by another app. Close that app and try again, or upload a photograph instead.";
  return "The camera could not be opened. Try again, or return to your profile and upload a photograph.";
}

export function SelfieCamera({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const aliveRef = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [shot, setShot] = useState<{ preview: string; file: File }>();
  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    let cancelled = false;
    aliveRef.current = true;
    setError("");
    setReady(false);
    setCapturing(false);
    async function open() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "This browser cannot open a live camera. Open this HTTPS link in Safari or Chrome, or upload a photograph instead.",
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stop();
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (!cancelled && video.videoWidth > 0) setReady(true);
      } catch (e) {
        if (!cancelled) {
          stop();
          setError(cameraError(e));
        }
      }
    }
    // React's development Strict Mode mounts effects twice. Starting on the
    // next task lets its first cleanup cancel the unused camera request.
    const start = window.setTimeout(() => {
      void open();
    }, 0);
    return () => {
      window.clearTimeout(start);
      cancelled = true;
      aliveRef.current = false;
      stop();
    };
  }, [attempt]);
  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("The camera is still getting ready. Please try again.");
      return;
    }
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 320;
      const context = canvas.getContext("2d");
      if (!context) throw Error("Canvas unavailable");
      const side = Math.min(video.videoWidth, video.videoHeight);
      context.drawImage(
        video,
        (video.videoWidth - side) / 2,
        (video.videoHeight - side) / 2,
        side,
        side,
        0,
        0,
        320,
        320,
      );
      const preview = canvas.toDataURL("image/jpeg", 0.85);
      canvas.toBlob(
        (blob) => {
          if (!aliveRef.current) return;
          if (!blob) {
            setError("The photograph could not be captured. Please try again.");
            setCapturing(false);
            return;
          }
          setShot({
            preview,
            file: new File([blob], "selfie.jpg", { type: "image/jpeg" }),
          });
          stop();
          setReady(false);
          setCapturing(false);
        },
        "image/jpeg",
        0.85,
      );
    } catch {
      setError("The photograph could not be captured. Please try again.");
      setCapturing(false);
    }
  }
  return (
    <div
      className="modal-backdrop camera-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if (e.key === "Tab") {
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),a[href],input:not(:disabled)",
            ),
          );
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        className="modal camera-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-title"
        aria-describedby="camera-description"
      >
        <div className="camera-heading">
          <div>
            <p className="eyebrow">YOUR TEAM PORTRAIT</p>
            <h2 id="camera-title">{shot ? "Looking good." : "Hello, you."}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close camera"
            autoFocus
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p id="camera-description">
          {shot
            ? "Happy with this one? Use it, or try another."
            : "Allow camera access when your browser asks, then centre your face in the circle."}
        </p>
        <div
          className={`camera-preview ${shot ? "has-shot" : ""}`}
          hidden={Boolean(error)}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            hidden={Boolean(shot)}
            aria-label="Live selfie camera"
            onLoadedData={() => setReady(true)}
          />
          {shot && <img src={shot.preview} alt="Your captured selfie" />}
          {!ready && !shot && (
            <span className="camera-loading" role="status">
              Waiting for your camera…
            </span>
          )}
          <span className="camera-guide" aria-hidden="true" />
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="camera-actions">
          {shot ? (
            <>
              <button
                className="secondary"
                onClick={() => {
                  setShot(undefined);
                  setAttempt((a) => a + 1);
                }}
              >
                <RefreshCw size={17} /> Retake
              </button>
              <button className="primary" onClick={() => onCapture(shot.file)}>
                <Check size={17} /> Use this photo
              </button>
            </>
          ) : (
            <>
              <button className="secondary" onClick={onClose}>
                Back to profile
              </button>
              {error ? (
                <button
                  className="primary"
                  onClick={() => setAttempt((a) => a + 1)}
                >
                  Try camera again
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={!ready || capturing}
                  onClick={capture}
                >
                  <Camera size={18} />
                  {capturing ? "Capturing…" : "Capture selfie"}
                </button>
              )}
            </>
          )}
        </div>
        <small>
          The camera switches off after capture or when you close this window.
          No microphone access is requested. Your photo is only submitted when
          you send your survey.
        </small>
      </section>
    </div>
  );
}
