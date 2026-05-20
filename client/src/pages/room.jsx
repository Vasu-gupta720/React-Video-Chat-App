import React, {useEffect, useRef, useState} from "react";
import { useNavigate } from 'react-router-dom';
import { useSocket } from "../providers/socket";
import  { usePeer } from "../providers/peer";
const RoomPage = () => {
    const socket = useSocket();
    const { createOffer, createAnswer, setRemoteDescriptionFor, setLocalStream, addIceCandidate, removePeer, remoteStreams, setOnIceCandidate } = usePeer();

    const [myStream, setMyStream] = useState(null);
   
    const videoRef = useRef(null);
    const navigate = useNavigate();

    const getUserMediaStream = React.useCallback(async() => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setMyStream(stream);
            if (setLocalStream) setLocalStream(stream);
            return stream;
        } catch (err) {
            console.error('Error getting user media', err);
            return null;
        }
    }, [setLocalStream]);

    const [participants, setParticipants] = useState([]);
    const [participantStates, setParticipantStates] = useState({});
    const [myEmail] = useState(() => {
        try { return sessionStorage.getItem('emailId') || null } catch (e) { return null }
    });
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [handRaised, setHandRaised] = useState(false);
    const [remoteTileStates] = useState({});
    const remoteRefs = useRef({});
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [theme, setTheme] = useState(() => {
        try { return localStorage.getItem('roomTheme') || 'light'; } catch (e) { return 'light'; }
    });

    


    const handleNewUserJoined = React.useCallback(async(data) => {
        const emailId = typeof data === 'string' ? data : data?.emailId;
        const targetSocketId = data?.socketId;
        if (!emailId || !targetSocketId) return;
        if (!myStream) {
            const s = await getUserMediaStream();
            if (setLocalStream) setLocalStream(s);
        }
        console.log("New user joined", emailId, targetSocketId);
        const offer = await createOffer(targetSocketId);
        socket.emit("call-user", { to: targetSocketId, offer, from: socket.id, emailId: myEmail });
    }, [socket, createOffer, myStream, getUserMediaStream, setLocalStream, myEmail]);

    const handleIncomingCall = React.useCallback(async(data) => {
        const { from, offer, emailId } = data;
        if (!from || !offer) return;
        // add sender to participants immediately so remote tile can show name
        if (emailId) {
            setParticipants(p => p.find(x => x.socketId === from || x.emailId === emailId) ? p : [...p, { emailId, socketId: from }]);
        }
        if (!myStream) {
            const s = await getUserMediaStream();
            if (setLocalStream) setLocalStream(s);
        }
        console.log("Incoming call from", from);
        const answer = await createAnswer(from, offer);
        socket.emit("answer-call", { to: from, answer, from: socket.id });
    }, [socket, createAnswer, myStream, getUserMediaStream, setLocalStream]);

    const handleCallAnswered = React.useCallback((data) => {
        const { from, answer, emailId } = data;
        if (!from || !answer) return;
        if (emailId) {
            setParticipants(p => p.find(x => x.socketId === from || x.emailId === emailId) ? p : [...p, { emailId, socketId: from }]);
        }
        console.log("Call answered by", from);
        setRemoteDescriptionFor(from, answer);
    }, [setRemoteDescriptionFor]);

    useEffect(() => {
        if (videoRef.current && myStream) {
            try {
                videoRef.current.srcObject = myStream;
                videoRef.current.autoplay = true;
                videoRef.current.playsInline = true;
                // muted local preview to allow autoplay without user gesture
                videoRef.current.muted = true;
                const p = videoRef.current.play();
                if (p && p.catch) p.catch(e => console.warn('Local video play() blocked:', e));
            } catch (e) {
                console.warn('Failed to attach local stream to video element', e);
            }
        }
    }, [myStream]);

    useEffect(() => {
        // nothing: remote streams are rendered directly from `remoteStreams`
    }, [remoteStreams]);

    useEffect(() => {
        Object.entries(remoteTileStates).forEach(([socketId, tileState]) => {
            const el = remoteRefs.current[socketId];
            if (el) {
                el.muted = !!tileState.muted;
            }
        });
    }, [remoteTileStates]);

    // keep remote video/audio elements in sync with both participant state (what sender allows)
    // and local tile overrides (viewer-muted). Viewer mute takes precedence.
    useEffect(() => {
        Object.keys(remoteRefs.current || {}).forEach(socketId => {
            const el = remoteRefs.current[socketId];
            if (!el) return;
            const pState = participantStates[socketId] || {};
            const tileState = remoteTileStates[socketId] || {};
            const senderAudioEnabled = (typeof pState.audioEnabled === 'boolean') ? pState.audioEnabled : true;
            const viewerMuted = !!tileState.muted;
            // If viewer muted the tile, keep it muted. Otherwise mute if sender turned off audio.
            el.muted = viewerMuted || (senderAudioEnabled === false);
        });
    }, [participantStates, remoteTileStates]);

    useEffect(() => {
        // handle users joining/leaving in participants list
        const onJoinedRoom = (data) => {
            const { emailId } = data || {};
            if (emailId && emailId === myEmail) {
                setParticipants((p) => {
                    const already = p.find(x => x.emailId === emailId);
                    if (already) return p;
                    return [...p, { emailId, socketId: socket.id }];
                });
            }
        };

        const onUserConnected = (data) => {
            const { emailId, socketId } = data || {};
            if (!emailId) return;
            setParticipants((p) => {
                if (p.find(x => x.socketId === socketId || x.emailId === emailId)) return p;
                return [...p, { emailId, socketId }];
            });
        };

        const onUserDisconnected = (data) => {
            const { socketId, emailId } = data || {};
            setParticipants((p) => p.filter(x => x.socketId !== socketId && x.emailId !== emailId));
            if (socketId) removePeer(socketId);
        };

        socket.on('joined-room', onJoinedRoom);
        socket.on('user-connected', onUserConnected);
        socket.on('user-disconnected', onUserDisconnected);

        return () => {
            socket.off('joined-room', onJoinedRoom);
            socket.off('user-connected', onUserConnected);
            socket.off('user-disconnected', onUserDisconnected);
        };
    }, [socket, myEmail, removePeer]);

    useEffect(() => {
        socket.on('user-connected', handleNewUserJoined);
        socket.on('incoming-call', handleIncomingCall);
        socket.on('call-answered', handleCallAnswered);

        const onIceCandidate = (data) => {
            const { from, candidate } = data || {};
            if (!candidate) return;
            addIceCandidate(from, candidate);
        };
        socket.on('ice-candidate', onIceCandidate);

        // forward local candidate events through socket
        setOnIceCandidate(({ to, candidate }) => {
            if (!to || !candidate) return;
            socket.emit('ice-candidate', { to, candidate, from: socket.id });
        });

        const onParticipantState = (data) => {
            const { socketId, audioEnabled, videoEnabled } = data || {};
            if (!socketId) return;
            setParticipantStates(prev => ({ ...prev, [socketId]: { ...(prev[socketId] || {}), audioEnabled, videoEnabled } }));
        };
        socket.on('participant-state', onParticipantState);

        const onParticipantHand = (data) => {
            const { socketId, raised } = data || {};
            if (!socketId) return;
            setParticipantStates(prev => ({ ...prev, [socketId]: { ...(prev[socketId] || {}), handRaised: !!raised } }));
        };
        socket.on('participant-hand', onParticipantHand);

        return () => {
            socket.off('user-connected', handleNewUserJoined);
            socket.off('incoming-call', handleIncomingCall);
            socket.off('call-answered', handleCallAnswered);
            socket.off('ice-candidate', onIceCandidate);
            socket.off('participant-state', onParticipantState);
            socket.off('participant-hand', onParticipantHand);
        };
    }, [socket, handleNewUserJoined, handleIncomingCall, handleCallAnswered, addIceCandidate, setOnIceCandidate]);

    const toggleAudio = () => {
        if (!myStream) return;
        myStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
        const enabled = myStream.getAudioTracks().some(t => t.enabled);
        setAudioEnabled(enabled);
        socket.emit('update-media-state', { audioEnabled: enabled, videoEnabled });
    };

    const toggleVideo = () => {
        if (!myStream) return;
        myStream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
        const v = myStream.getVideoTracks().some(t => t.enabled);
        setVideoEnabled(v);
        socket.emit('update-media-state', { audioEnabled, videoEnabled: v });
    };

    const leaveRoom = () => {
        try {
            if (myStream) myStream.getTracks().forEach(t => t.stop());
        } catch (e) {}
        try { sessionStorage.removeItem('roomId'); sessionStorage.removeItem('emailId'); } catch (e) {}
        navigate('/');
    };

    const toggleTheme = () => {
        setTheme(prev => {
            const next = prev === 'light' ? 'dark' : 'light';
            try { localStorage.setItem('roomTheme', next); } catch (e) {}
            return next;
        });
    };

    useEffect(() => {
        getUserMediaStream();
    }, [getUserMediaStream]);

    // voice activity detection for local stream (show badge only when speaking)
    useEffect(() => {
        if (!myStream) return;
        let audioContext = null;
        let analyser = null;
        let source = null;
        let rafId = null;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            source = audioContext.createMediaStreamSource(myStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            const bufferLength = analyser.fftSize;
            const dataArray = new Uint8Array(bufferLength);
            const check = () => {
                analyser.getByteTimeDomainData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const v = (dataArray[i] - 128) / 128;
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / bufferLength);
                // threshold tuned empirically; adjust if too sensitive
                setIsSpeaking(rms > 0.03);
                rafId = requestAnimationFrame(check);
            };
            rafId = requestAnimationFrame(check);
        } catch (e) {
            console.warn('VAD setup failed', e);
        }
        return () => {
            try {
                if (rafId) cancelAnimationFrame(rafId);
                if (audioContext && audioContext.state !== 'closed') audioContext.close();
            } catch (e) {}
            setIsSpeaking(false);
        };
    }, [myStream]);

    useEffect(() => {
        if (!audioEnabled) setIsSpeaking(false);
    }, [audioEnabled]);

    // announce initial media state once we have local stream
    useEffect(() => {
        if (!myStream) return;
        socket.emit('update-media-state', { audioEnabled, videoEnabled });
    }, [myStream, socket, audioEnabled, videoEnabled]);

    const remoteCount = Object.keys(remoteStreams || {}).length;

    return (
        <div className={`room-page-container ${theme}`}>
                <div className="room-header">
                <h1>Room</h1>
                <div className="controls">
                    <button type="button" onClick={toggleTheme} className="theme-toggle">
                        <span className="btn-icon">{theme === 'light' ? '🌙' : '☀️'}</span>
                        <span className="btn-text">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
                    </button>
                    <button onClick={leaveRoom} className="danger">Leave</button>
                </div>
            </div>

            <div className="room-body">
                <aside className="participants">
                    <h4>Participants</h4>
                    <ul>
                        {myEmail && <li className="me"><span className="email">You: {myEmail}</span><span className="badge">You</span></li>}
                        {participants.map(p => {
                            const state = participantStates[p.socketId] || {};
                            return (
                                <li key={p.socketId || p.emailId} className={p.emailId === myEmail ? 'me' : ''}>
                                    <span className="email">{p.emailId}</span>
                                    <span className="badge">
                                        {state.handRaised ? '✋ raised' : (state.audioEnabled === false ? 'muted' : (state.videoEnabled === false ? 'video off' : ''))}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                </aside>

                <section className="video-area">
                    <div className="video-grid">
                        <div className="video-card remote-videos">
                            <h3>Participants</h3>
                            <div className={`remote-grid ${remoteCount === 1 ? 'two-up' : ''}`}>
                                {/* local tile first */}
                                <div className={`remote-item local-item`} key={socket.id || 'local'}>
                                    <div className="video-wrapper">
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            muted
                                            playsInline
                                            className="video-element"
                                        />
                                        <div className="status-badges local-overlay">
                                            {audioEnabled ? (isSpeaking && <span className="badge live">🔊</span>) : <span className="badge muted">🔇</span>}
                                            {(videoEnabled === false) && <span className="badge video-off">📷</span>}
                                        </div>
                                        {handRaised && <div className="hand-badge local">✋</div>}
                                    </div>
                                    <div className="remote-label">You: {myEmail || 'Me'}</div>
                                    <div className="local-controls-inline">
                                        <button type="button" className={`local-btn video ${videoEnabled ? 'on' : 'off'}`} onClick={(e) => { e.stopPropagation(); toggleVideo(); }}>
                                            <span className="btn-icon">{videoEnabled ? '⏹' : '▶'}</span>
                                            <span className="btn-text">{videoEnabled ? 'Stop' : 'Start'}</span>
                                        </button>
                                        <button type="button" className={`local-btn audio ${audioEnabled ? 'on' : 'off'}`} onClick={(e) => { e.stopPropagation(); toggleAudio(); }}>
                                            <span className="btn-icon">{audioEnabled ? '🔇' : '🔊'}</span>
                                            <span className="btn-text">{audioEnabled ? 'Mute' : 'Unmute'}</span>
                                        </button>
                                        <button type="button" className={"local-btn hand-btn " + (handRaised ? 'raised' : '')} onClick={(e) => { e.stopPropagation(); const next = !handRaised; setHandRaised(next); try { socket.emit('hand-raised', { raised: next }); } catch (err) {} }}>
                                            <span className="btn-icon">✋</span>
                                            <span className="btn-text">{handRaised ? 'Raised' : 'Raise'}</span>
                                        </button>
                                    </div>
                                </div>
                                {Object.entries(remoteStreams || {}).map(([socketId, stream]) => {
                                    const participant = participants.find(p => p.socketId === socketId) || {};
                                    const label = participant.emailId || socketId;
                                    const state = participantStates[socketId] || {};
                                    const tileState = remoteTileStates[socketId] || { muted: false, hidden: false };
                                    const initials = (label || '').split('@')[0].split(/\W+/).map(s => s[0]).join('').slice(0,2).toUpperCase();
                                    const videoOff = state.videoEnabled === false;
                                    const hiddenClass = tileState.hidden ? 'hidden' : '';
                                    const wrapperClass = `remote-item ${hiddenClass}`;
                                    return (
                                    <div className={wrapperClass} key={socketId}>
                                        {!tileState.hidden && !videoOff ? (
                                            <div className="video-wrapper">
                                                <video
                                                    className="video-element"
                                                    ref={el => {
                                                        if (el) {
                                                            try {
                                                                if (videoOff) {
                                                                    try { el.pause(); } catch (pauseErr) {}
                                                                    el.srcObject = null;
                                                                    remoteRefs.current[socketId] = el;
                                                                    return;
                                                                }
                                                                el.srcObject = stream;
                                                                el.autoplay = true;
                                                                el.playsInline = true;
                                                                el.muted = tileState.muted;
                                                                const p = el.play();
                                                                if (p && p.catch) p.catch(err => console.warn('Remote video play() blocked:', err));
                                                                remoteRefs.current[socketId] = el;
                                                            } catch (err) {
                                                                console.warn('Failed to attach remote stream', err);
                                                            }
                                                        }
                                                    }}
                                                />
                                                {state.handRaised && <div className="hand-badge remote">✋</div>}
                                                <div className="status-badges remote-overlay">
                                                    {state.audioEnabled === false ? <span className="badge muted">🔇</span> : <span className="badge live">🔊</span>}
                                                    {state.videoEnabled === false && <span className="badge video-off">📷</span>}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="avatar">{initials}</div>
                                        )}
                                        <div className="remote-label">{label}</div>
                                    </div>
                                )})}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}

export default RoomPage;
