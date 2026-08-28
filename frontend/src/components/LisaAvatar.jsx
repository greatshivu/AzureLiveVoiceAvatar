import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkle, X, Microphone, PaperPlaneRight, Waveform, WarningCircle } from "@phosphor-icons/react";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { getConfig } from "../lib/api";
import { parseCommand, describeSearch, readRow } from "../lib/voiceCommands";
import { dispatchSearch, getResults } from "../lib/voiceBus";
import { PAGES, pageByKey, pageByRoute, routeFor } from "../config/pages";

const POSTER =
    "https://images.unsplash.com/photo-1506863530036-1efeddceb993?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjB3b21hbiUyMHBvcnRyYWl0JTIwc3R1ZGlvfGVufDB8fHx8MTc4NzUxMzIwMHww&ixlib=rb-4.1.0&q=85";

const STATUS_TEXT = {
    idle: "Avatar is off",
    connecting: "Connecting to Lisa…",
    negotiating: "Starting video…",
    live: "Live — speak or type",
    error: "Something went wrong",
};

const WS_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/^http/, "ws");
const VOICE_WS = `${WS_BASE}/api/voice/ws`;

export const LisaAvatar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [expanded, setExpanded] = useState(false);
    const [avatarOn, setAvatarOn] = useState(false);
    const [status, setStatus] = useState("idle");
    const [messages, setMessages] = useState([]);
    const [config, setConfig] = useState({ voicelive_configured: false });
    const [error, setError] = useState("");
    const [textInput, setTextInput] = useState("");
    const [autoTurn, setAutoTurn] = useState(true);
    const audioContextRef = useRef(null);
    const micStreamRef = useRef(null);
    const micSourceRef = useRef(null);
    const processorRef = useRef(null);
    const micMuteGainRef = useRef(null);

    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const wsRef = useRef(null);
    const pcRef = useRef(null);
    const micRef = useRef(null);
    const avatarOnRef = useRef(false);
    const autoTurnRef = useRef(true);
    const locationRef = useRef(location.pathname);
    const scrollRef = useRef(null);

    useEffect(() => {
        getConfig().then(setConfig).catch(() => { });
    }, []);
    useEffect(() => { locationRef.current = location.pathname; }, [location.pathname]);
    useEffect(() => { avatarOnRef.current = avatarOn; }, [avatarOn]);
    useEffect(() => { autoTurnRef.current = autoTurn; }, [autoTurn]);
    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, status]);

    const currentKey = () => pageByRoute(locationRef.current).key;
    const pushMessage = (role, text) => setMessages((m) => [...m.slice(-20), { role, text, id: Date.now() + Math.random() }]);

    const startMicrophone = async () => {
        console.log("======================================");
        console.log("🎤 STARTING MICROPHONE");
        console.log("======================================");

        const stream =
            await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                }
            });

        micStreamRef.current = stream;

        const track = stream.getAudioTracks()[0];

        console.log("🎤 Microphone track:", {
            id: track.id,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
        });

        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        const audioContext =
            new AudioContext();

        audioContextRef.current =
            audioContext;

        await audioContext.resume();

        console.log(
            "🎤 Browser audio sample rate:",
            audioContext.sampleRate
        );

        const source =
            audioContext.createMediaStreamSource(
                stream
            );

        micSourceRef.current = source;

        /*
         * ScriptProcessorNode is intentionally used here
         * because it works reliably for this debugging/
         * browser implementation.
         *
         * Later we can replace it with AudioWorklet.
         */
        const processor =
            audioContext.createScriptProcessor(
                4096,
                1,
                1
            );

        processorRef.current =
            processor;

        /*
         * Keep microphone out of the local speakers.
         */
        const muteGain =
            audioContext.createGain();

        muteGain.gain.value = 0;

        micMuteGainRef.current =
            muteGain;

        source.connect(processor);

        processor.connect(muteGain);

        muteGain.connect(
            audioContext.destination
        );

        processor.onaudioprocess = (event) => {

            const ws =
                wsRef.current;

            if (
                !ws ||
                ws.readyState !== WebSocket.OPEN
            ) {
                return;
            }

            const input =
                event.inputBuffer.getChannelData(0);

            /*
             * Browser normally gives us 48 kHz.
             *
             * Voice Live session is configured for
             * 24 kHz PCM16.
             */
            const pcm16 = downsampleFloat32ToPCM16(input, audioContext.sampleRate, 24000);

            if (!pcm16.length) {
                return;
            }

            const base64 = arrayBufferToBase64(pcm16.buffer);

            ws.send(JSON.stringify({type: "input_audio_buffer.append",audio: base64}));
        };

        console.log("✅ Microphone PCM streaming started");
    };

    // ---- Config-driven UI actions (drive the on-screen pages) ----
    const runSearch = (intent, targetKey, cur) => {
        if (targetKey !== cur) navigate(routeFor(targetKey));
        const page = pageByKey(targetKey);
        dispatchSearch(targetKey, {
            filters: intent.filters,
            page: intent.page,
            reset: intent.reset,
            onResult: (total) => {
                const c = total == null ? "" : ` (${total.toLocaleString()} matching ${page.noun})`;
                pushMessage("assistant", `${describeSearch(intent, page)}${c}`);
            },
        });
    };

    const readTopRow = async (intent, cur) => {
        const targetKey = intent.target || cur;
        if (targetKey !== cur) navigate(routeFor(targetKey));
        let rows = getResults(targetKey);
        for (let i = 0; i < 15 && rows.length === 0; i++) {
            await new Promise((r) => setTimeout(r, 200));
            rows = getResults(targetKey);
        }
        if (!rows.length) { pushMessage("assistant", "There are no results to read yet. Try a search first."); return; }
        const idx = intent.index < 0 ? rows.length - 1 : Math.min(intent.index, rows.length - 1);
        pushMessage("assistant", readRow(rows[idx], pageByKey(targetKey)));
    };

    const runCommand = async (text) => {
        const cur = currentKey();
        const intent = parseCommand(text, cur);
        if (intent.type === "navigate") {
            navigate(routeFor(intent.target));
            pushMessage("assistant", `Opening ${pageByKey(intent.target).title}.`);
        } else if (intent.type === "read") {
            await readTopRow(intent, cur);
        } else if (intent.type === "search") {
            runSearch(intent, intent.target || cur, cur);
        } else if (!avatarOnRef.current) {
            pushMessage("assistant", "Turn on Lisa to talk to the agent, or try a search/navigation command.");
        }
        // When live, non-command speech is handled by the Foundry agent via the avatar.
    };

    // ---- Voice Live WebRTC signalling ----
    const waitIce = (pc) =>
        new Promise((resolve) => {
            if (pc.iceGatheringState === "complete") return resolve();
            const check = () => {
                if (pc.iceGatheringState === "complete") {
                    pc.removeEventListener("icegatheringstatechange", check);
                    resolve();
                }
            };
            pc.addEventListener("icegatheringstatechange", check);
            setTimeout(resolve, 2500);
        });

    //const setupWebRTC = async (session) => {
    //  setStatus("negotiating");
    //  const ice = session?.avatar?.ice_servers || session?.ice_servers || [];
    //  const pc = new RTCPeerConnection({ iceServers: ice });
    //  pcRef.current = pc;
    //  pc.ontrack = (ev) => {
    //    if (ev.track.kind === "video" && videoRef.current) videoRef.current.srcObject = ev.streams[0];
    //    else if (ev.track.kind === "audio" && audioRef.current) audioRef.current.srcObject = ev.streams[0];
    //  };
    //  try {
    //    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    //    micRef.current = mic;
    //    mic.getAudioTracks().forEach((t) => pc.addTrack(t, mic));
    //  } catch (e) {
    //    pushMessage("assistant", "I couldn't access your microphone. You can still type commands.");
    //  }
    //  pc.addTransceiver("video", { direction: "recvonly" });

    //  const offer = await pc.createOffer();
    //  await pc.setLocalDescription(offer);
    //  await waitIce(pc);
    //  const packed = btoa(JSON.stringify({ type: "offer", sdp: pc.localDescription.sdp }));
    //  wsRef.current?.send(JSON.stringify({ type: "session.avatar.connect", client_sdp: packed }));
    //};
    const setupWebRTC = async (session) => {
        try {
            console.log("======================================");
            console.log("SETTING UP WEBRTC");
            console.log("======================================");

            setStatus("negotiating");

            const iceServers =
                session?.avatar?.ice_servers ||
                session?.ice_servers ||
                [];

            console.log(
                "Voice Live ICE servers:",
                iceServers
            );

            const pc = new RTCPeerConnection({
                iceServers
            });

            pcRef.current = pc;

            // -----------------------------------------
            // Connection state
            // -----------------------------------------

            pc.onconnectionstatechange = () => {

                console.log(
                    "WebRTC connectionState:",
                    pc.connectionState
                );

                if (pc.connectionState === "connected") {
                    console.log("======================================");

                    console.log("✅ WEBRTC CONNECTED");

                    console.log("🎤 Microphone RTP should now reach Voice Live");

                    console.log("======================================");

                    setStatus("live");
                    startMicrophone();
                }

                if (
                    pc.connectionState === "failed" ||
                    pc.connectionState === "disconnected" ||
                    pc.connectionState === "closed"
                ) {
                    console.warn(
                        "WebRTC connection lost:",
                        pc.connectionState
                    );
                }
            };

            pc.oniceconnectionstatechange = () => {

                console.log(
                    "WebRTC ICE state:",
                    pc.iceConnectionState
                );
            };

            pc.onsignalingstatechange = () => {

                console.log(
                    "WebRTC signaling state:",
                    pc.signalingState
                );
            };

            // -----------------------------------------
            // Remote avatar tracks
            // -----------------------------------------

            pc.ontrack = (event) => {

                console.log(
                    "🎥 Remote WebRTC track:",
                    event.track.kind
                );

                console.log(
                    "Track state:",
                    event.track.readyState
                );

                const stream =
                    event.streams?.[0];

                if (!stream) {
                    console.warn(
                        "Remote track has no stream"
                    );
                    return;
                }

                if (event.track.kind === "video") {

                    if (videoRef.current) {

                        videoRef.current.srcObject =
                            stream;

                        videoRef.current
                            .play()
                            .catch((err) => {
                                console.warn(
                                    "Video autoplay failed:",
                                    err
                                );
                            });
                    }
                }

                if (event.track.kind === "audio") {

                    if (audioRef.current) {

                        audioRef.current.srcObject =
                            stream;

                        audioRef.current
                            .play()
                            .catch((err) => {
                                console.warn(
                                    "Audio autoplay failed:",
                                    err
                                );
                            });
                    }
                }
            };

            // -----------------------------------------
            // MICROPHONE
            // -----------------------------------------

            console.log("Requesting microphone...");

            const mic = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                }
            });

            micRef.current = mic;

            const audioTracks = mic.getAudioTracks();

            console.log("🎤 Microphone tracks:",
                audioTracks.map(track => ({
                    id: track.id,
                    label: track.label,
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState
                }))
            );

            if (!audioTracks.length) { throw new Error("No microphone audio track was created."); }

            // -----------------------------------------
            // Add microphone to WebRTC
            // -----------------------------------------

            for (const track of audioTracks) {
                console.log("🎤 Adding microphone track:", track.id);
                pc.addTrack(track, mic);
            }

            // -----------------------------------------
            // Receive avatar video/audio
            // -----------------------------------------

            pc.addTransceiver("video", { direction: "recvonly" });

            // We want to receive the avatar audio.
            pc.addTransceiver("audio", { direction: "recvonly" });

            // -----------------------------------------
            // Create offer
            // -----------------------------------------

            const offer = await pc.createOffer();

            console.log("Created WebRTC offer");

            console.log("Audio transceivers:",
                pc.getTransceivers().map(t => ({
                    kind: t.receiver?.track?.kind ||
                        t.sender?.track?.kind,
                    direction: t.direction,
                    currentDirection: t.currentDirection,
                    senderTrack:
                        t.sender?.track?.id || null
                }))
            );

            await pc.setLocalDescription(offer);

            await waitIce(pc);

            const localSdp = pc.localDescription?.sdp;

            if (!localSdp) { throw new Error("WebRTC local SDP was not generated."); }

            console.log("Local SDP audio:", localSdp.includes("m=audio"));

            console.log("Local SDP video:", localSdp.includes("m=video"));

            // -----------------------------------------
            // Send avatar signaling
            // -----------------------------------------

            const packed =
                btoa(
                    JSON.stringify({
                        type: "offer",
                        sdp: localSdp
                    })
                );

            const signalingMessage = {
                type: "session.avatar.connect",
                client_sdp: packed
            };

            console.log(
                "Sending session.avatar.connect"
            );

            wsRef.current?.send(
                JSON.stringify(
                    signalingMessage
                )
            );

        } catch (error) {

            console.error(
                "❌ WebRTC setup failed:",
                error
            );

            setError(
                error?.message ||
                "Unable to start microphone/WebRTC."
            );

            setStatus("error");

            pushMessage(
                "assistant",
                "Unable to start the microphone connection."
            );
        }
    };

    //const handleServerEvent = async (raw) => {
    //    let e;
    //    try { e = JSON.parse(raw); } catch { return; }
    //    switch (e.type) {
    //        case "error":
    //            setError(e.error?.message || "Voice Live error");
    //            setStatus("error");
    //            pushMessage("assistant", e.error?.message || "Voice Live error");
    //            break;
    //        case "session.updated":
    //            await setupWebRTC(e.session);
    //            break;
    //        case "session.avatar.connecting":
    //            if (e.server_sdp && pcRef.current) {
    //                try {
    //                    const ans = JSON.parse(atob(e.server_sdp));
    //                    await pcRef.current.setRemoteDescription({ type: "answer", sdp: ans.sdp });
    //                    setStatus("live");
    //                } catch (err) {
    //                    setError("Avatar SDP negotiation failed.");
    //                    setStatus("error");
    //                }
    //            }
    //            break;
    //        case "conversation.item.input_audio_transcription.completed":
    //            if (e.transcript) { pushMessage("user", e.transcript); runCommand(e.transcript); }
    //            break;
    //        case "response.audio_transcript.done":
    //            if (e.transcript) pushMessage("assistant", e.transcript);
    //            break;
    //        default:
    //            break;
    //    }
    //};

    const handleServerEvent = async (raw) => {

        let event;

        try {
            event =
                typeof raw === "string"
                    ? JSON.parse(raw)
                    : raw;
        } catch (error) {

            console.warn(
                "Invalid Voice Live event:",
                raw
            );

            return;
        }

        console.log(
            "VOICE LIVE EVENT:",
            event.type,
            event
        );

        switch (event.type) {

            // -----------------------------------------
            // Session ready
            // -----------------------------------------

            case "session.updated":

                console.log(
                    "✅ Voice Live session updated"
                );

                await setupWebRTC(
                    event.session
                );

                break;


            // -----------------------------------------
            // Avatar SDP answer
            // -----------------------------------------

            case "session.avatar.connecting":

                console.log(
                    "🎥 Voice Live returned avatar SDP"
                );

                if (
                    event.server_sdp &&
                    pcRef.current
                ) {

                    try {

                        const answer =
                            JSON.parse(
                                atob(
                                    event.server_sdp
                                )
                            );

                        console.log(
                            "Setting remote SDP"
                        );

                        await pcRef.current
                            .setRemoteDescription({
                                type: "answer",
                                sdp: answer.sdp
                            });

                        console.log(
                            "✅ Remote SDP set"
                        );

                    } catch (error) {

                        console.error(
                            "❌ Failed to set remote SDP:",
                            error
                        );

                        setError(
                            "Avatar SDP negotiation failed."
                        );

                        setStatus("error");
                    }
                }

                break;


            // -----------------------------------------
            // USER SPEECH
            // -----------------------------------------

            case "input_audio_buffer.speech_started":

                console.log(
                    "🎤 SERVER DETECTED SPEECH START"
                );

                break;


            case "input_audio_buffer.speech_stopped":

                console.log(
                    "🎤 SERVER DETECTED SPEECH STOP"
                );

                break;


            case "input_audio_buffer.committed":

                console.log(
                    "🎤 SERVER COMMITTED AUDIO"
                );

                break;


            // -----------------------------------------
            // TRANSCRIPTION
            // -----------------------------------------

            case "conversation.item.input_audio_transcription.delta":

                console.log(
                    "📝 Transcript delta:",
                    event.delta
                );

                break;


            case "conversation.item.input_audio_transcription.completed":
                console.log("======================================");
                console.log("🗣️ SERVER RECEIVED SPEECH:");
                console.log(event.transcript);
                console.log("======================================");
                if (event.transcript) {
                    pushMessage("user", event.transcript);
                    // IMPORTANT:
                    // Do not send the transcript back
                    // to the agent here.
                    //
                    // Voice Live already sent the
                    // audio to the agent.
                    runCommand(event.transcript);
                }
                break;


            // -----------------------------------------
            // AGENT RESPONSE
            // -----------------------------------------

            case "response.audio_transcript.delta":

                console.log(
                    "🤖 Agent transcript delta:",
                    event.delta
                );

                break;


            case "response.audio_transcript.done":

                console.log(
                    "🤖 Agent response:",
                    event.transcript
                );

                if (event.transcript) {

                    pushMessage(
                        "assistant",
                        event.transcript
                    );
                }

                break;


            case "response.created":

                console.log(
                    "🤖 Agent response started"
                );

                break;


            case "response.done":

                console.log(
                    "🤖 Agent response completed"
                );

                break;


            // -----------------------------------------
            // ERROR
            // -----------------------------------------

            case "error":

                console.error(
                    "❌ Voice Live error:",
                    event
                );

                setError(
                    event.error?.message ||
                    "Voice Live error"
                );

                setStatus("error");

                break;


            default:

                // Keep this while debugging.
                console.log(
                    "Voice Live event:",
                    event.type
                );

                break;
        }
    };

    const startAvatar = () => {
        setError("");
        if (!config.voicelive_configured) {
            setStatus("error");
            pushMessage("assistant", "Azure Voice Live isn't configured yet. Add VOICELIVE_ENDPOINT, FOUNDRY_PROJECT_NAME, the agent name/id + version and Azure credentials in the backend .env.");
            return;
        }
        setStatus("connecting");
        const ws = new WebSocket(VOICE_WS);
        wsRef.current = ws;
        ws.onopen = () => ws.send(JSON.stringify({ type: "start", auto_turn: autoTurnRef.current }));
        ws.onmessage = (evt) => handleServerEvent(evt.data);
        ws.onerror = () => { setStatus("error"); setError("Could not reach the Voice Live service."); };
        ws.onclose = () => { if (avatarOnRef.current) setStatus("idle"); };
    };

    const stopAvatar = () => {
        try { wsRef.current?.close(); } catch (e) { }
        try { pcRef.current?.close(); } catch (e) { }
        try { micRef.current?.getTracks().forEach((t) => t.stop()); } catch (e) { }
        wsRef.current = null;
        pcRef.current = null;
        micRef.current = null;
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
        pushMessage("user", t);
        // Typed text: if live, forward to the agent so the avatar responds; also run UI commands.
        if (avatarOnRef.current && wsRef.current?.readyState === 1) {
            console.log("⌨️ Sending text to Voice Live:", text);
            wsRef.current.send(JSON.stringify({
                type: "conversation.item.create",
                item: { type: "message", role: "user", content: [{ type: "input_text", text: t }] },
            }));
            wsRef.current.send(JSON.stringify({ type: "response.create" }));
        }
        runCommand(t);
    };

    const isLive = status === "live" || status === "negotiating";
    const curPage = pageByRoute(location.pathname);
    const hints = [
        ...(curPage.hints || []),
        ...PAGES.filter((p) => p.key !== curPage.key).map((p) => `Go to ${p.title}`),
    ];

    return (
        <>
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
                        {isLive && <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-white" />}
                    </motion.button>
                )}
            </AnimatePresence>

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
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${isLive ? "bg-emerald-500" : "bg-slate-300"}`} data-testid="lisa-status-dot" />
                                <div className="leading-none">
                                    <p className="font-heading text-sm font-bold text-slate-900">Lisa AI Assistant</p>
                                    <p className="text-[11px] text-slate-400">{STATUS_TEXT[status]}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Switch checked={avatarOn} onCheckedChange={toggleAvatar} data-testid="lisa-power-switch" />
                                <button onClick={() => setExpanded(false)} data-testid="lisa-close-btn" className="text-slate-400 hover:text-slate-700 transition-colors">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50/60">
                            <Checkbox id="lisa-autoturn" checked={autoTurn} onCheckedChange={(v) => setAutoTurn(!!v)} data-testid="lisa-autoturn-checkbox" />
                            <label htmlFor="lisa-autoturn" className="text-[11px] font-medium text-slate-600 cursor-pointer select-none">
                                Auto turn-taking (barge-in)
                            </label>
                        </div>

                        <div className={`relative h-48 md:h-56 w-full bg-slate-900 ${isLive ? "lisa-active-glow" : ""}`}>
                            <video ref={videoRef} data-testid="lisa-video" autoPlay playsInline muted className={`h-full w-full object-cover ${avatarOn ? "block" : "hidden"}`} />
                            <audio ref={audioRef} autoPlay />
                            {!avatarOn && (
                                <div className="absolute inset-0">
                                    <img src={POSTER} alt="Lisa" className="h-full w-full object-cover opacity-70" />
                                    <div className="absolute inset-0 bg-slate-900/40 flex flex-col items-center justify-center text-center px-4">
                                        <p className="text-white/90 text-sm font-medium">Toggle on to go live with Lisa</p>
                                        <p className="text-white/50 text-xs mt-1">Azure Voice Live avatar</p>
                                    </div>
                                </div>
                            )}
                            {(status === "connecting" || status === "negotiating") && (
                                <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
                                    <div className="flex items-center gap-2 text-white text-sm">
                                        <Waveform size={20} className="animate-pulse" /> {STATUS_TEXT[status]}
                                    </div>
                                </div>
                            )}
                            {status === "live" && (
                                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 rounded-full px-2.5 py-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-[10px] text-white font-semibold uppercase tracking-wide">Live</span>
                                </div>
                            )}
                        </div>

                        <div ref={scrollRef} data-testid="lisa-transcript" className="h-32 p-3 bg-white/60 border-t border-slate-100 overflow-y-auto flex flex-col gap-2">
                            {error && (
                                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                                    <WarningCircle size={16} className="shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}
                            {messages.length === 0 && !error && (
                                <p className="text-xs text-slate-400 m-auto">Turn on the avatar and speak, or type a command below.</p>
                            )}
                            {messages.map((m) => (
                                <div key={m.id} className={`max-w-[85%] text-xs rounded-lg px-3 py-1.5 ${m.role === "user" ? "self-end bg-blue-600 text-white" : "self-start bg-slate-100 text-slate-700"}`}>
                                    {m.text}
                                </div>
                            ))}
                        </div>

                        <div data-testid="lisa-hints" className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1 border-t border-slate-100">
                            <span className="text-[10px] uppercase tracking-wide text-slate-400 w-full mb-0.5">Try saying…</span>
                            {hints.map((h) => (
                                <button
                                    key={h}
                                    onClick={() => { pushMessage("user", h); runCommand(h); }}
                                    data-testid={`lisa-hint-${h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                                    className="text-[11px] px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors active:scale-95"
                                >
                                    {h}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 p-3 border-t border-slate-100">
                            <Microphone size={18} className={avatarOn ? "text-blue-600" : "text-slate-300"} weight={avatarOn ? "fill" : "regular"} />
                            <Input
                                data-testid="lisa-text-input"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && onSendText()}
                                placeholder="e.g. show delivered orders"
                                className="h-8 text-sm border-slate-200"
                            />
                            <Button size="sm" onClick={onSendText} data-testid="lisa-send-btn" className="h-8 w-8 p-0 bg-blue-600 hover:bg-blue-700">
                                <PaperPlaneRight size={15} weight="fill" />
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};
function downsampleFloat32ToPCM16(
    input,
    inputSampleRate,
    outputSampleRate
) {
    if (
        outputSampleRate >= inputSampleRate
    ) {
        const pcm =
            new Int16Array(
                input.length
            );

        for (
            let i = 0;
            i < input.length;
            i++
        ) {
            let sample =
                Math.max(
                    -1,
                    Math.min(
                        1,
                        input[i]
                    )
                );

            pcm[i] =
                sample < 0
                    ? sample * 0x8000
                    : sample * 0x7fff;
        }

        return pcm;
    }

    const ratio =
        inputSampleRate /
        outputSampleRate;

    const outputLength =
        Math.round(
            input.length /
            ratio
        );

    const output =
        new Int16Array(
            outputLength
        );

    let offsetResult = 0;
    let offsetBuffer = 0;

    while (
        offsetResult <
        output.length
    ) {
        const nextOffsetBuffer =
            Math.round(
                (offsetResult + 1) *
                ratio
            );

        let accum = 0;
        let count = 0;

        for (
            let i = offsetBuffer;
            i < nextOffsetBuffer &&
            i < input.length;
            i++
        ) {
            accum += input[i];
            count++;
        }

        const sample =
            count
                ? accum / count
                : 0;

        const clamped =
            Math.max(
                -1,
                Math.min(
                    1,
                    sample
                )
            );

        output[offsetResult] =
            clamped < 0
                ? clamped * 0x8000
                : clamped * 0x7fff;

        offsetResult++;

        offsetBuffer =
            nextOffsetBuffer;
    }

    return output;
}

function arrayBufferToBase64(
    buffer
) {
    const bytes =
        new Uint8Array(buffer);

    let binary = "";

    const chunkSize = 0x8000;

    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {
        const chunk =
            bytes.subarray(
                i,
                Math.min(
                    i + chunkSize,
                    bytes.length
                )
            );

        binary += String.fromCharCode(
            ...chunk
        );
    }

    return btoa(binary);
}