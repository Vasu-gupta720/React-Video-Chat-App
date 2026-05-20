import React, { useCallback, useEffect, useState, useRef } from "react";

const peerContext = React.createContext(null);

export const usePeer = () => React.useContext(peerContext);

export const PeerProvider = (props) => {
    const localStreamRef = useRef(null);
    const peersRef = useRef(new Map()); // socketId -> RTCPeerConnection
    const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> MediaStream
    const onIceCandidateRef = useRef(null);

    const createPeerConnection = useCallback((socketId) => {
        try {
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            });

            pc.ontrack = (ev) => {
                const [stream] = ev.streams;
                if (stream) {
                    setRemoteStreams(prev => ({ ...prev, [socketId]: stream }));
                }
            };

            pc.onicecandidate = (ev) => {
                if (ev.candidate && onIceCandidateRef.current) {
                    try { onIceCandidateRef.current({ to: socketId, candidate: ev.candidate }); } catch(e){}
                }
            };

            // add local tracks if available
            const ls = localStreamRef.current;
            if (ls) {
                ls.getTracks().forEach(t => pc.addTrack(t, ls));
            }

            peersRef.current.set(socketId, pc);
            return pc;
        } catch (e) {
            console.error('createPeerConnection failed', e);
            return null;
        }
    }, []);

    const setOnIceCandidate = useCallback((cb) => {
        onIceCandidateRef.current = cb;
    }, []);

    const setLocalStream = useCallback((stream) => {
        localStreamRef.current = stream;
        // add tracks to all existing peers
        peersRef.current.forEach(pc => {
            try { stream.getTracks().forEach(t => pc.addTrack(t, stream)); } catch(e){}
        });
    }, []);

    const createOffer = useCallback(async (toSocketId) => {
        const pc = peersRef.current.get(toSocketId) || createPeerConnection(toSocketId);
        if (!pc) throw new Error('PeerConnection not available');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        return offer;
    }, [createPeerConnection]);

    const createAnswer = useCallback(async (fromSocketId, offer) => {
        const pc = peersRef.current.get(fromSocketId) || createPeerConnection(fromSocketId);
        if (!pc) throw new Error('PeerConnection not available');
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        return answer;
    }, [createPeerConnection]);

    const setRemoteDescriptionFor = useCallback(async (socketId, desc) => {
        const pc = peersRef.current.get(socketId);
        if (!pc) throw new Error('PeerConnection not found for ' + socketId);
        await pc.setRemoteDescription(desc);
    }, []);

    const addIceCandidate = useCallback(async (socketId, candidate) => {
        const pc = peersRef.current.get(socketId);
        if (!pc) return;
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.error('addIceCandidate', e); }
    }, []);

    const removePeer = useCallback((socketId) => {
        const pc = peersRef.current.get(socketId);
        if (pc) {
            try { pc.close(); } catch(e){}
            peersRef.current.delete(socketId);
        }
        setRemoteStreams(prev => {
            const copy = { ...prev };
            delete copy[socketId];
            return copy;
        });
    }, []);

    useEffect(() => {
        const peers = peersRef.current;
        return () => {
            peers.forEach(pc => { try { pc.close(); } catch(e){} });
            peers.clear();
        };
    }, []);

    return (
        <peerContext.Provider value={{ createOffer, createAnswer, setRemoteDescriptionFor, setLocalStream, addIceCandidate, removePeer, remoteStreams, setOnIceCandidate }}>
            {props.children}
        </peerContext.Provider>
    );
};