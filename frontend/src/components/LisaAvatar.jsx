import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkle,
  X,
  Microphone,
  PaperPlaneRight,
  Waveform,
  WarningCircle,
} from "@phosphor-icons/react";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { getConfig, getAvatarCredentials, sendChat } from "../lib/api";
import { parseCommand, describeSearch, readRow } from "../lib/voiceCommands";
import { dispatchSearch, getResults } from "../lib/voiceBus";
import { PAGES, pageByKey, pageByRoute, routeFor } from "../config/pages";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

const POSTER =
  "https://images.unsplash.com/photo-1506863530036-1efeddceb993?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjB3b21hbiUyMHBvcnRyYWl0JTIwc3R1ZGlvfGVufDB8fHx8MTc4NzUxMzIwMHww&ixlib=rb-4.1.0&q=85";

const STATUS_TEXT = {
  idle: "Avatar is off",
  connecting: "Connecting to Lisa…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Lisa is speaking…",
  error: "Something went wrong",
};

const getSDK = () => SpeechSDK;

export const LisaAvatar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [avatarOn, setAvatarOn] = useState(false);
  const [status, setStatus] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [config, setConfig] = useState({ speech_configured: false, foundry_configured: false });
  const [error, setError] = useState("");
  const [textInput, setTextInput] = useState("");
  const [autoInterrupt, setAutoInterrupt] = useState(true);
  const [interruptKeyword, setInterruptKeyword] = useState("hold on");

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pcRef = useRef(null);
  const synthRef = useRef(null);
  const recognizerRef = useRef(null);
  const threadRef = useRef(null);
  const speakingRef = useRef(false);
  const processingRef = useRef(false);
  const avatarOnRef = useRef(false);
  const autoInterruptRef = useRef(true);
  const interruptKeywordRef = useRef("hold on");
  const locationRef = useRef(location.pathname);
  const scrollRef = useRef(null);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    autoInterruptRef.current = autoInterrupt;
  }, [autoInterrupt]);

  useEffect(() => {
    interruptKeywordRef.current = (interruptKeyword || "").trim().toLowerCase() || "hold on";
  }, [interruptKeyword]);

  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    avatarOnRef.current = avatarOn;
  }, [avatarOn]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, status]);

  const currentKey = () => pageByRoute(locationRef.current).key;

  const pushMessage = (role, text) =>
    setMessages((m) => [...m.slice(-20), { role, text, id: Date.now() + Math.random() }]);

  const speak = (text) =>
    new Promise((resolve) => {
      if (!synthRef.current || !text) return resolve();
      speakingRef.current = true;
      synthRef.current.speakTextAsync(
        text,
        () => {
          speakingRef.current = false;
          resolve();
        },
        () => {
          speakingRef.current = false;
          resolve();
        }
      );
    });

  const stopSpeaking = () =>
    new Promise((resolve) => {
      if (synthRef.current?.stopSpeakingAsync) {
        synthRef.current.stopSpeakingAsync(
          () => {
            speakingRef.current = false;
            resolve();
          },
          () => {
            speakingRef.current = false;
            resolve();
          }
        );
      } else {
        speakingRef.current = false;
        resolve();
      }
    });

  const say = async (text) => {
    pushMessage("assistant", text);
    if (synthRef.current) {
      setStatus("speaking");
      await speak(text);
    }
  };

  const runSearchWithCount = async (intent, targetKey, cur) => {
    if (targetKey !== cur) navigate(routeFor(targetKey));
    const page = pageByKey(targetKey);
    const base = describeSearch(intent, page);
    const total = await new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (!done) {
          done = true;
          resolve(v);
        }
      };
      dispatchSearch(targetKey, {
        filters: intent.filters,
        page: intent.page,
        reset: intent.reset,
        onResult: (t) => finish(t),
      });
      setTimeout(() => finish(null), 5000);
    });
    const count = total == null ? "" : ` That's ${total.toLocaleString()} matching ${page.noun}.`;
    await say(`${base}${count}`);
  };

  const readTopRow = async (intent, cur) => {
    const targetKey = intent.target || cur;
    const page = pageByKey(targetKey);
    if (targetKey !== cur) navigate(routeFor(targetKey));
    // wait for the (possibly just-navigated) page to publish its rows
    let rows = getResults(targetKey);
    for (let i = 0; i < 15 && rows.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 200));
      rows = getResults(targetKey);
    }
    if (!rows.length) {
      await say("There are no results to read yet. Try a search first.");
      return;
    }
    const idx = intent.index < 0 ? rows.length - 1 : Math.min(intent.index, rows.length - 1);
    await say(readRow(rows[idx], page));
  };

  const processCommand = async (text, cur) => {
    const intent = parseCommand(text, cur);
    if (intent.type === "navigate") {
      navigate(routeFor(intent.target));
      await say(`Opening ${pageByKey(intent.target).title}. I'm listening.`);
    } else if (intent.type === "read") {
      await readTopRow(intent, cur);
    } else if (intent.type === "search") {
      await runSearchWithCount(intent, intent.target || cur, cur);
    } else {
      setStatus("thinking");
      const res = await sendChat(text, threadRef.current);
      threadRef.current = res.thread_id;
      await say(res.text);
    }
  };

  const handleUtterance = async (raw) => {
    const clean = (raw || "").trim();
    if (!clean) return;

    let text = clean;
    // Barge-in handling while Lisa is talking.
    if (speakingRef.current) {
      if (autoInterruptRef.current) {
        await stopSpeaking();
        setStatus("listening");
      } else {
        const kw = interruptKeywordRef.current;
        if (clean.toLowerCase().includes(kw)) {
          await stopSpeaking();
          setStatus("listening");
          // strip the keyword; run any trailing command
          const safeKw = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          text = clean.replace(new RegExp(safeKw, "i"), "").replace(/^[,.\s]+/, "").trim();
          if (!text) {
            pushMessage("user", clean);
            return;
          }
        } else {
          // Not the interrupt word and auto-interrupt is off: ignore, keep speaking.
          return;
        }
      }
    }

    if (processingRef.current) return;
    processingRef.current = true;
    pushMessage("user", clean);

    try {
      await processCommand(text, currentKey());
    } catch (e) {
      const msg =
        e?.response?.status === 503
          ? "The Foundry agent isn't configured yet. Add the FOUNDRY_* environment variables to answer general questions. Navigation and search still work."
          : "I couldn't reach the agent. Please try again.";
      await say(msg);
    } finally {
      processingRef.current = false;
      setStatus(avatarOnRef.current ? "listening" : "idle");
    }
  };

  const startAvatar = async () => {
    setError("");
    const SDK = getSDK();
    if (!SDK) {
      setError("Azure Speech SDK failed to load.");
      setStatus("error");
      return;
    }
    if (!config.speech_configured) {
      setStatus("error");
      setError("Azure Speech is not configured. Add AZURE_SPEECH_* environment variables in the backend.");
      pushMessage("assistant", "Azure Speech is not configured yet. Add your keys to start the live avatar.");
      return;
    }
    setStatus("connecting");
    try {
      const c = await getAvatarCredentials();
      const speechConfig = SDK.SpeechConfig.fromAuthorizationToken(c.speech_token, c.speech_region);
      speechConfig.speechSynthesisVoiceName = c.tts_voice;
      speechConfig.speechRecognitionLanguage = "en-US";

      const ice = c.ice;
      const iceServer = {
        urls: ice.Urls || ice.urls,
        username: ice.Username || ice.username,
        credential: ice.Password || ice.credential,
      };
      const pc = new RTCPeerConnection({ iceServers: [iceServer] });
      pcRef.current = pc;
      pc.ontrack = (event) => {
        if (event.track.kind === "video" && videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
        } else if (event.track.kind === "audio" && audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
        }
      };
      pc.addTransceiver("video", { direction: "sendrecv" });
      pc.addTransceiver("audio", { direction: "sendrecv" });

      const avatarConfig = new SDK.AvatarConfig(c.avatar_character, c.avatar_style);
      const synth = new SDK.AvatarSynthesizer(speechConfig, avatarConfig);
      synthRef.current = synth;
      await synth.startAvatarAsync(pc);

      // Continuous speech recognition (voice commands)
      const recognizer = new SDK.SpeechRecognizer(
        speechConfig,
        SDK.AudioConfig.fromDefaultMicrophoneInput()
      );
      recognizer.recognized = (_s, e) => {
        if (e.result.reason === SDK.ResultReason.RecognizedSpeech && e.result.text) {
          handleUtterance(e.result.text);
        }
      };
      recognizerRef.current = recognizer;
      recognizer.startContinuousRecognitionAsync();

      setStatus("listening");
      const greeting = config.foundry_configured
        ? "Hi, I'm Lisa. Ask me to search your orders or items, or say 'go to Items Search'. I'm listening."
        : "Hi, I'm Lisa. Tell me things like 'show delivered orders' or 'go to Items Search' and I'll drive the screen for you.";
      pushMessage("assistant", greeting);
      await speak(greeting);
    } catch (e) {
      console.error(e);
      setStatus("error");
      setError("Failed to start the avatar session. Check your Azure Speech resource and region.");
    }
  };

  const stopAvatar = () => {
    try {
      recognizerRef.current?.stopContinuousRecognitionAsync();
      recognizerRef.current?.close();
    } catch (e) {}
    try {
      synthRef.current?.close();
    } catch (e) {}
    try {
      pcRef.current?.close();
    } catch (e) {}
    recognizerRef.current = null;
    synthRef.current = null;
    pcRef.current = null;
    speakingRef.current = false;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setStatus("idle");
  };

  const toggleAvatar = (on) => {
    setAvatarOn(on);
    if (on) startAvatar();
    else stopAvatar();
  };

  const onSendText = () => {
    const t = textInput.trim();
    if (!t) return;
    setTextInput("");
    handleUtterance(t);
  };

  const isLive = ["listening", "thinking", "speaking"].includes(status);
  const curPage = pageByRoute(location.pathname);
  const hints = [
    ...(curPage.hints || []),
    ...PAGES.filter((p) => p.key !== curPage.key).map((p) => `Go to ${p.title}`),
  ];

  return (
    <>
      {/* Collapsed floating button */}
      <AnimatePresence>
        {!expanded && (
          <motion.button
            key="fab"
            data-testid="lisa-toggle-fab"
            onClick={() => setExpanded(true)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ y: -4 }}
            className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center"
          >
            <Sparkle size={26} weight="fill" />
            {isLive && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-white" />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Expanded popup */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="popup"
            data-testid="lisa-popup"
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed bottom-6 right-6 z-50 w-80 md:w-96 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.16)] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${isLive ? "bg-emerald-500" : "bg-slate-300"}`}
                  data-testid="lisa-status-dot"
                />
                <div className="leading-none">
                  <p className="font-heading text-sm font-bold text-slate-900">Lisa AI Assistant</p>
                  <p className="text-[11px] text-slate-400">{STATUS_TEXT[status]}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={avatarOn}
                  onCheckedChange={toggleAvatar}
                  data-testid="lisa-power-switch"
                />
                <button
                  onClick={() => setExpanded(false)}
                  data-testid="lisa-close-btn"
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Barge-in settings */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="lisa-autointerrupt"
                  checked={autoInterrupt}
                  onCheckedChange={(v) => setAutoInterrupt(!!v)}
                  data-testid="lisa-autointerrupt-checkbox"
                />
                <label
                  htmlFor="lisa-autointerrupt"
                  className="text-[11px] font-medium text-slate-600 cursor-pointer select-none"
                >
                  Auto barge-in
                </label>
              </div>
              {!autoInterrupt && (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">stop word</span>
                  <Input
                    value={interruptKeyword}
                    onChange={(e) => setInterruptKeyword(e.target.value)}
                    data-testid="lisa-interrupt-keyword"
                    placeholder="hold on"
                    className="h-6 text-[11px] px-2 border-slate-200"
                  />
                </div>
              )}
            </div>

            {/* Video area */}
            <div
              className={`relative h-48 md:h-56 w-full bg-slate-900 ${isLive ? "lisa-active-glow" : ""}`}
            >
              <video
                ref={videoRef}
                data-testid="lisa-video"
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${avatarOn ? "block" : "hidden"}`}
              />
              <audio ref={audioRef} autoPlay />
              {!avatarOn && (
                <div className="absolute inset-0">
                  <img src={POSTER} alt="Lisa" className="h-full w-full object-cover opacity-70" />
                  <div className="absolute inset-0 bg-slate-900/40 flex flex-col items-center justify-center text-center px-4">
                    <p className="text-white/90 text-sm font-medium">Toggle on to go live with Lisa</p>
                    <p className="text-white/50 text-xs mt-1">Voice-driven Azure avatar</p>
                  </div>
                </div>
              )}
              {status === "connecting" && (
                <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-white text-sm">
                    <Waveform size={20} className="animate-pulse" /> Connecting…
                  </div>
                </div>
              )}
              {isLive && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 rounded-full px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] text-white font-semibold uppercase tracking-wide">Live</span>
                </div>
              )}
            </div>

            {/* Transcript */}
            <div
              ref={scrollRef}
              data-testid="lisa-transcript"
              className="h-32 p-3 bg-white/60 border-t border-slate-100 overflow-y-auto flex flex-col gap-2"
            >
              {error && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                  <WarningCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {messages.length === 0 && !error && (
                <p className="text-xs text-slate-400 m-auto">
                  Turn on the avatar and speak, or type a command below.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] text-xs rounded-lg px-3 py-1.5 ${
                    m.role === "user"
                      ? "self-end bg-blue-600 text-white"
                      : "self-start bg-slate-100 text-slate-700"
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>

            {/* Command hints */}
            <div
              data-testid="lisa-hints"
              className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1 border-t border-slate-100"
            >
              <span className="text-[10px] uppercase tracking-wide text-slate-400 w-full mb-0.5">
                Try saying…
              </span>
              {hints.map((h) => (
                <button
                  key={h}
                  onClick={() => handleUtterance(h)}
                  data-testid={`lisa-hint-${h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                  className="text-[11px] px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors active:scale-95"
                >
                  {h}
                </button>
              ))}
            </div>

            {/* Command input (works by voice when live, or type anytime) */}
            <div className="flex items-center gap-2 p-3 border-t border-slate-100">
              <Microphone
                size={18}
                className={avatarOn ? "text-blue-600" : "text-slate-300"}
                weight={avatarOn ? "fill" : "regular"}
              />
              <Input
                data-testid="lisa-text-input"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSendText()}
                placeholder="e.g. show delivered orders"
                className="h-8 text-sm border-slate-200"
              />
              <Button
                size="sm"
                onClick={onSendText}
                data-testid="lisa-send-btn"
                className="h-8 w-8 p-0 bg-blue-600 hover:bg-blue-700"
              >
                <PaperPlaneRight size={15} weight="fill" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
