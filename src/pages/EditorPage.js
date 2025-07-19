import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useParams, useNavigate, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Client from '../components/Client';
import { initSocket } from '../socket';
import ACTIONS from '../Actions';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';

const languageMap = {
  javascript: { language: 'nodejs', versionIndex: '4' },
  python: { language: 'python3', versionIndex: '3' },
  java: { language: 'java', versionIndex: '4' },
  cpp: { language: 'cpp17', versionIndex: '0' },
};

const getLanguageExtension = (lang) => {
  switch (lang) {
    case 'javascript':
      return javascript();
    case 'python':
      return python();
    case 'java':
      return java();
    case 'cpp':
      return cpp();
    default:
      return javascript();
  }
};

const EditorPage = () => {
  const [clients, setClients] = useState([]);
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState('');
  const [userInput, setUserInput] = useState('');
  const [output, setOutput] = useState('');
  const { roomId } = useParams();
  const socketRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const [asideWidth, setAsideWidth] = useState(250);
  const isResizing = useRef(false);

  const [userId] = useState(() => {
    const savedId = localStorage.getItem('userId');
    if (savedId) return savedId;
    const newId = uuidv4();
    localStorage.setItem('userId', newId);
    return newId;
  });

  // Define handleErrors here so it's accessible to socket.on calls
  const handleErrors = React.useCallback((e) => { // Use useCallback to ensure stability
    console.error('Socket error:', e);
    toast.error('Socket connection failed');
    navigate('/');
  }, [navigate]); // navigate is stable, so handleErrors is stable


  // Effect for Socket.IO initialization and event listeners
  useEffect(() => {
    // Only initialize socket if it hasn't been initialized yet
    // This is crucial for preventing multiple connections
    if (!socketRef.current) {
        console.log('Attempting to initialize socket...');
        const init = async () => {
            socketRef.current = await initSocket();
            console.log('Socket initialized:', socketRef.current.id);

            socketRef.current.on('connect_error', handleErrors);
            socketRef.current.on('connect_failed', handleErrors);

            // Emit JOIN action with room details
            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
                userId,
            });

            // Listener for when other clients join the room
            socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
                if (username !== location.state?.username) {
                    toast.success(`${username} joined`);
                }
                setClients(clients.filter((c) => c.userId));
            });

            // Listener for when a client receives the full room state on joining
            socketRef.current.on(ACTIONS.SYNC_ALL_CODE, ({ code, language, userInput, output }) => {
                console.log('Received full sync:', { code, language, userInput, output });
                if (code !== null) setCode(code);
                if (language !== null) setLanguage(language);
                if (userInput !== null) setUserInput(userInput);
                if (output !== null) setOutput(output);
            });

            // Listener for code changes from other clients
            socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code: incomingCode }) => {
                // Only update if the incoming code is different to avoid unnecessary re-renders
                if (incomingCode !== null && incomingCode !== code) {
                    setCode(incomingCode);
                }
            });

            // Listener for language changes from other clients
            socketRef.current.on(ACTIONS.LANGUAGE_CHANGE, ({ language: incomingLanguage }) => {
                if (incomingLanguage !== null && incomingLanguage !== language) {
                    setLanguage(incomingLanguage);
                }
            });

            // Listener for input box changes from other clients
            socketRef.current.on(ACTIONS.INPUT_CHANGE, ({ userInput: incomingUserInput }) => {
                if (incomingUserInput !== null && incomingUserInput !== userInput) {
                    setUserInput(incomingUserInput);
                }
            });

            // Listener for output box changes from other clients
            socketRef.current.on(ACTIONS.OUTPUT_CHANGE, ({ output: incomingOutput }) => {
                if (incomingOutput !== null && incomingOutput !== output) {
                    setOutput(incomingOutput);
                }
            });

            // Listener for client disconnection
            socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
                toast.success(`${username} left the room`);
                setClients((prev) => prev.filter((c) => c.socketId !== socketId));
            });
        };

        init();
    }


    // Cleanup function: disconnect socket and remove listeners when component unmounts
    // This is vital for preventing duplicate listeners and managing connections
    return () => {
      if (socketRef.current) {
        console.log('Disconnecting socket and cleaning up listeners.');
        socketRef.current.disconnect();
        socketRef.current.off('connect_error', handleErrors);
        socketRef.current.off('connect_failed', handleErrors);
        socketRef.current.off(ACTIONS.JOINED);
        socketRef.current.off(ACTIONS.SYNC_ALL_CODE);
        socketRef.current.off(ACTIONS.CODE_CHANGE);
        socketRef.current.off(ACTIONS.LANGUAGE_CHANGE);
        socketRef.current.off(ACTIONS.INPUT_CHANGE);
        socketRef.current.off(ACTIONS.OUTPUT_CHANGE);
        socketRef.current.off(ACTIONS.DISCONNECTED);
        socketRef.current = null; // Set ref to null after disconnecting
      }
    };
    // Dependencies: Only include values that, if they change, *truly* require a re-initialization of the socket.
    // Ensure all functions passed as dependencies are wrapped in useCallback or are inherently stable.
  }, [roomId, location.state?.username, userId, navigate, handleErrors]);


  // Handlers for user interactions

  // Handle language selection change and emit to others
  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    socketRef.current?.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: newLanguage });
  };

  // Handle input box change and emit to others
  const handleUserInput = (e) => {
    const newUserInput = e.target.value;
    setUserInput(newUserInput);
    socketRef.current?.emit(ACTIONS.INPUT_CHANGE, { roomId, userInput: newUserInput });
  };

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success('Room ID copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy Room ID');
    }
  };

  const leaveRoom = () => {
    navigate('/');
  };

  // Resize sidebar (existing functionality)
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      const newWidth = e.clientX;
      if (newWidth > 150 && newWidth < 600) {
        setAsideWidth(newWidth);
      }
    };

    const stopResizing = () => {
      isResizing.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, []);

  // Run code functionality
  const runCode = async () => {
    if (!code.trim()) {
      toast.error('No code to run!');
      return;
    }

    const { language: jdLang, versionIndex } = languageMap[language];
    setOutput('Running code...'); // Set output immediately
    socketRef.current?.emit(ACTIONS.OUTPUT_CHANGE, { roomId, output: 'Running code...' }); // Sync "Running..." state

    try {
      const { data } = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/run`, {
        script: code,
        stdin: userInput,
        language: jdLang,
        versionIndex,
        roomId: roomId // Pass roomId to backend to update shared output state
      });

      const resultOutput = data.output?.trim() || '';
      setOutput(resultOutput);
      // Backend will now handle broadcasting OUTPUT_CHANGE, so no explicit emit here
    } catch (error) {
      console.error('JDoodle API error:', error?.response?.data || error.message);
      toast.error('Code execution failed');

      const errOutput =
        error?.response?.data?.error ||
        'An error occurred while executing your code.';
      setOutput(errOutput);
      // Backend will now handle broadcasting OUTPUT_CHANGE for errors, so no explicit emit here
    }
  };

  if (!location.state) return <Navigate to="/" />;

  return (
    <div className="mainwrap" style={{ display: 'flex', height: '100vh' }}>
      <div
        className="aside"
        style={{
          width: asideWidth,
          minWidth: 150,
          maxWidth: 600,
          backgroundColor: '#20232a',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="asideInner">
          <div className="logo">
            <img className="logoImage" width="200px" src="/code.png" alt="Logo" />
          </div>
          <h3>Connected</h3>
          <div className="clientsList">
            {clients.map((client) => (
              <Client key={client.socketId} username={client.username} />
            ))}
          </div>
        </div>
        <button className="btn copyBtn" onClick={copyRoomId}>
          Copy ROOM ID
        </button>
        <button className="btn leavebtn" onClick={leaveRoom}>
          Leave
        </button>
      </div>

      {/* Resizer */}
      <div
        style={{
          width: '5px',
          cursor: 'col-resize',
          backgroundColor: '#444',
        }}
        onMouseDown={() => (isResizing.current = true)}
      ></div>

      <div className="editorwrap" style={{ flex: 1, padding: '1rem' }}>
        <div style={{ textAlign: 'right' }}>
          <select
            className="language-selector"
            value={language}
            onChange={handleLanguageChange}
            style={{ padding: '0.3rem', fontSize: '1rem' }}
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </select>
        </div>

        <CodeMirror
          value={code}
          height="60vh"
          theme="dark"
          extensions={[getLanguageExtension(language)]}
          onChange={(value) => {
            setCode(value);
            socketRef.current?.emit(ACTIONS.CODE_CHANGE, { roomId, code: value });
          }}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            autocompletion: true,
          }}
          style={{
            fontSize: '14px',
            fontFamily: 'monospace',
            backgroundColor: '#1e1e1e',
            color: '#ffffff',
            // Add scrollbar for the CodeMirror editor if content overflows
            overflow: 'auto',
          }}
        />

        {/* Input and Output side by side */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <textarea
            placeholder="Enter custom input here (stdin)..."
            value={userInput}
            onChange={handleUserInput}
            style={{
              flex: 1,
              height: '150px',
              padding: '0.75rem',
              fontFamily: 'monospace',
              fontSize: '1rem',
              backgroundColor: '#1e1e1e',
              color: '#ffffff',
              border: '1px solid #555',
              borderRadius: '4px',
              resize: 'none',
              overflow: 'auto', // Added for scrollbar
            }}
          />
          <textarea
            value={output}
            readOnly
            placeholder="Output will appear here ..."
            style={{
              flex: 1,
              height: '150px',
              padding: '0.75rem',
              fontFamily: 'monospace',
              fontSize: '1rem',
              backgroundColor: '#1e1e1e',
              color: '#00ff00',
              border: '1px solid #333',
              borderRadius: '4px',
              resize: 'none',
              overflow: 'auto', // Added for scrollbar
            }}
          />
        </div>

        <div style={{ marginTop: '0.75rem' }}>
          <button className="run-btn" onClick={runCode}>
            Execute
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditorPage;
