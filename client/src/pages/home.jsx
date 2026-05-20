import React, {useState, useEffect, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';
import { useSocket } from '../providers/socket';

const Homepage = () => {
    const socket = useSocket();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [roomId, setRoomId] = useState('');

    const handleRoomJoined = useCallback((data) => {
        const id = data && typeof data === 'object' ? data.roomId : data;
        if (!id) return;
        navigate(`/room/${id}`);
    }, [navigate]);

    useEffect(() => {
        socket.on('joined-room', handleRoomJoined);
        return () => {
            socket.off('joined-room', handleRoomJoined);
        };
    }, [socket, handleRoomJoined]);
    const handleJoin = () => {
        // save for room page to read
        try { sessionStorage.setItem('emailId', email); sessionStorage.setItem('roomId', roomId); } catch (e) {}
        socket.emit('join-room', { emailId: email, roomId });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        handleJoin();
    };

    return (
        <div className='homepage-containner'>
            <form className='input-container' onSubmit={handleSubmit}>
                <input 
                    type = "email" 
                    placeholder="Enter your email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <input 
                    type = "text" 
                    placeholder="Enter your Room Code" 
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                />
                <button type="submit">Join</button>
            </form>
        </div>
    );
}

export default Homepage;