const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

// JDoodle API credentials
const clientId = process.env.REACT_APP_CLIENT_ID;
const clientSecret = process.env.REACT_APP_CLIENT_SECRET;

const ACTIONS = require('./src/Actions');
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for simplicity in development; tighten in production
    methods: ['GET', 'POST']
  }
});

// Enable CORS for Express routes
app.use(cors());
app.use(express.json()); // Middleware to parse JSON request bodies

// Store user data (socketId -> { username, userId })
const userSocketMap = {};
// Store room state (roomId -> { code, language, userInput, output })
const roomState = {};

// Helper function to get all connected clients in a specific room
function getAllConnectedClients(roomId) {
  const room = io.sockets.adapter.rooms.get(roomId) || new Set();
  const clients = Array.from(room).map((socketId) => ({
    socketId,
    username: userSocketMap[socketId]?.username || 'Anonymous',
    userId: userSocketMap[socketId]?.userId || null
  }));

  // Ensure uniqueness by userId, as a user might connect with multiple tabs/devices
  const uniqueClientsMap = new Map();
  clients.forEach(client => {
    if (!uniqueClientsMap.has(client.userId)) {
      uniqueClientsMap.set(client.userId, client);
    }
  });
  return Array.from(uniqueClientsMap.values());
}

// JDoodle code execution endpoint
app.post('/run', async (req, res) => {
  const { script, stdin, language, versionIndex, roomId } = req.body; // Added roomId

  if (!clientId || !clientSecret) {
    console.error('JDoodle API credentials are not set.');
    return res.status(500).json({ error: 'JDoodle API credentials missing on server.' });
  }

  try {
    const { data } = await axios.post('https://api.jdoodle.com/v1/execute', {
      clientId,
      clientSecret,
      script,
      stdin,
      language,
      versionIndex,
    });

    console.log('JDoodle API request successful.');

    // Store and broadcast output to all clients in the room
    if (roomId) {
      const currentRoom = roomState[roomId] || {};
      const newOutput = data.output?.trim() || 'No output returned';
      roomState[roomId] = { ...currentRoom, output: newOutput };
      io.to(roomId).emit(ACTIONS.OUTPUT_CHANGE, { output: newOutput });
    }

    res.json(data);
  } catch (error) {
    console.error('JDoodle API error:', error?.response?.data?.error || error.message);
    const errorMessage = error?.response?.data?.error || 'An error occurred while executing your code.';
    
    // Broadcast error output to all clients in the room
    if (roomId) {
      const currentRoom = roomState[roomId] || {};
      roomState[roomId] = { ...currentRoom, output: errorMessage };
      io.to(roomId).emit(ACTIONS.OUTPUT_CHANGE, { output: errorMessage });
    }

    res.status(500).json({ error: errorMessage });
  }
});

// Socket.IO logic for real-time communication
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Handle JOIN action
  socket.on(ACTIONS.JOIN, ({ roomId, username, userId }) => {
    userSocketMap[socket.id] = { username, userId };
    socket.join(roomId);

    // Initialize room state if it doesn't exist
    if (!roomState[roomId]) {
      roomState[roomId] = { code: '', language: 'javascript', userInput: '', output: '' };
    }

    const clients = getAllConnectedClients(roomId);
    console.log(`Room ${roomId} clients:`, clients.map(c => c.username));

    // Send updated client list to everyone in the room
    clients.forEach(({ socketId }) => {
      io.to(socketId).emit(ACTIONS.JOINED, {
        clients: clients,
        username: username, // The username of the user who just joined
        socketId: socket.id // The socket ID of the user who just joined
      });
    });

    // Send the full current state of the room to the newly joined client
    io.to(socket.id).emit(ACTIONS.SYNC_ALL_CODE, {
      code: roomState[roomId].code,
      language: roomState[roomId].language,
      userInput: roomState[roomId].userInput,
      output: roomState[roomId].output,
    });
  });

  // Handle CODE_CHANGE action
  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    roomState[roomId].code = code; // Update server-side state
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code }); // Broadcast to others in the room
  });

  // Handle LANGUAGE_CHANGE action (New)
  socket.on(ACTIONS.LANGUAGE_CHANGE, ({ roomId, language }) => {
    roomState[roomId].language = language; // Update server-side state
    socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, { language }); // Broadcast to others
  });

  // Handle INPUT_CHANGE action (New)
  socket.on(ACTIONS.INPUT_CHANGE, ({ roomId, userInput }) => {
    roomState[roomId].userInput = userInput; // Update server-side state
    socket.in(roomId).emit(ACTIONS.INPUT_CHANGE, { userInput }); // Broadcast to others
  });

  // Handle initial SYNC_CODE (only for code, deprecated by SYNC_ALL_CODE but kept for backward compatibility if needed)
  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    // This is typically sent from client to client for initial code sync.
    // With SYNC_ALL_CODE, this might become less critical for new joins.
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
  });


  // Handle client disconnection
  socket.on('disconnecting', () => {
    const rooms = [...socket.rooms];
    const disconnectedUser = userSocketMap[socket.id];

    rooms.forEach((roomId) => {
      // Broadcast to remaining clients in the room that a user disconnected
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: disconnectedUser?.username,
      });
    });

    // Clean up user from map
    delete userSocketMap[socket.id];

    // Optional: Clean up roomState if no one is left in the room
    // Note: If you want room state to persist after all users leave temporarily,
    // you would need a more sophisticated cleanup or persistence mechanism.
    let remainingSocketsInRoom = 0;
    for (const s of io.sockets.adapter.rooms.get(rooms[1]) || []) { // rooms[1] is typically the actual roomId
        if (userSocketMap[s]) { // Check if the socket is still a known user
            remainingSocketsInRoom++;
        }
    }
    if (remainingSocketsInRoom === 0 && roomState[rooms[1]]) {
        console.log(`Room ${rooms[1]} is empty. Deleting its state.`);
        delete roomState[rooms[1]];
    }
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
