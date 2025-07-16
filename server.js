const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const clientId = process.env.REACT_APP_CLIENT_ID;
const clientSecret = process.env.REACT_APP_CLIENT_SECRET;

const ACTIONS = require('./src/Actions');
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// JDoodle code execution endpoint
app.post('/run', async (req, res) => {
  const { script, stdin, language, versionIndex } = req.body;

  try {
    const { data } = await axios.post('https://api.jdoodle.com/v1/execute', {
      clientId,
      clientSecret,
      script,
      stdin,
      language,
      versionIndex,
    });

    console.log('Using clientId:', clientId);
    console.log('Using clientSecret:', clientSecret);

    res.json(data);
  } catch (error) {
    console.error('JDoodle error:', error.message);
    res.status(500).json({ error: 'Code execution failed.' });
  }
});

// Map of socketId -> { username, userId }
const userSocketMap = {};

// Helper to get all clients in a room
function getAllConnectedClients(roomId) {
  const room = io.sockets.adapter.rooms.get(roomId) || new Set();
  return Array.from(room).map((socketId) => ({
    socketId,
    username: userSocketMap[socketId]?.username || 'Anonymous',
    userId: userSocketMap[socketId]?.userId || null
  }));
}

// Socket.IO logic
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on(ACTIONS.JOIN, ({ roomId, username, userId }) => {
    // ✅ Allow multiple same userId connections
    userSocketMap[socket.id] = { username, userId };
    socket.join(roomId);

    const clients = getAllConnectedClients(roomId);
    console.log(`Room ${roomId} clients:`, clients);

    // Notify all clients
     // Remove duplicates by userId before sending
const uniqueClientsMap = new Map();
clients.forEach(client => {
  if (!uniqueClientsMap.has(client.userId)) {
    uniqueClientsMap.set(client.userId, client);
  }
});
const uniqueClients = Array.from(uniqueClientsMap.values());

// Notify all clients
uniqueClients.forEach(({ socketId }) => {
  io.to(socketId).emit(ACTIONS.JOINED, {
    clients: uniqueClients,
    username,
    socketId: socket.id
  });
});

  });

  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on('disconnecting', () => {
    const rooms = [...socket.rooms];
    const disconnectedUser = userSocketMap[socket.id];

    rooms.forEach((roomId) => {
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: disconnectedUser?.username,
      });
    });

    delete userSocketMap[socket.id];
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));


