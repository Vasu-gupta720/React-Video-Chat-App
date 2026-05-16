const express = require('express');
const bodyParser = require('body-parser');
const {Server} = require('socket.io');

const app = express();

app.use(bodyParser.json());

const emailTosocketMapping = new Map();
const socketToRoom = new Map();

const io = new Server({
    cors: {
        origin: '*',
        methods: ['GET','POST']
    }
});

io.on('connection', (socket) => {
    console.log('New client connected with socket id', socket.id);

    socket.on('join-room', (data) => {
        const { roomId, emailId } = data || {};
        console.log('User', emailId, 'joined room', roomId);
        if (emailId) emailTosocketMapping.set(emailId, socket.id);
        if (roomId) socketToRoom.set(socket.id, roomId);
        if (roomId) socket.join(roomId);
        socket.emit('joined-room', { roomId, emailId });
        socket.broadcast.to(roomId).emit('user-connected', { emailId, socketId: socket.id, roomId });
    });

    socket.on('call-user', (data) => {
        const { emailId, offer, to } = data || {};
        const socketId = to || emailTosocketMapping.get(emailId);
        if (socketId) {
            io.to(socketId).emit('incoming-call', { from: socket.id, offer });
        } else {
            console.log('call-user: no socket found for', emailId);
        }
    });

    socket.on('ice-candidate', (data) => {
        const { to, candidate } = data || {};
        if (!to || !candidate) return;
        io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    // relay media state (audio/video) updates to the room
    socket.on('update-media-state', (data) => {
        const { audioEnabled, videoEnabled } = data || {};
        const roomId = socketToRoom.get(socket.id);
        if (roomId) {
            socket.broadcast.to(roomId).emit('participant-state', { socketId: socket.id, audioEnabled, videoEnabled });
        }
    });

    socket.on('answer-call', (data) => {
        const { to, answer } = data || {};
        io.to(to).emit('call-answered', { from: socket.id, answer });
    });


    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);
        // notify room members about this disconnection
        const roomId = socketToRoom.get(socket.id);
        let disconnectedEmail = null;
        for (const [email, id] of emailTosocketMapping.entries()) {
            if (id === socket.id) {
                disconnectedEmail = email;
                emailTosocketMapping.delete(email);
                break;
            }
        }
        if (roomId) {
            socket.broadcast.to(roomId).emit('user-disconnected', { emailId: disconnectedEmail, socketId: socket.id, roomId });
            socketToRoom.delete(socket.id);
        }
    });
});

app.listen(8000, () => console.log('HTTP server is running on port 8000'));
io.listen(8001);
