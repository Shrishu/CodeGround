// import React, { useEffect, useRef } from 'react';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/darcula.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';
import ACTIONS from '../Actions';
import Codemirror from 'codemirror'; // ✅ You forgot this import

const Editor = ({ socketRef, roomId, onCodeChange }) => {
  const editorRef = useRef(null);

  useEffect(() => {
    async function init() {
      editorRef.current = Codemirror.fromTextArea(
        document.getElementById('realtimeEditor'),
        {
          mode: { name: 'javascript', json: true },
          theme: 'darcula',
          autoCloseTags: true,
          autoCloseBrackets: true,
          lineNumbers: true,
        }
      );

      editorRef.current.on('change', (instance, changes) => {
        const { origin } = changes;
        const code = instance.getValue();

        onCodeChange(code); // Propagate to parent

        // Prevent echoing the same code back to others
        if (origin !== 'setValue') {
          socketRef.current?.emit(ACTIONS.CODE_CHANGE, {
            roomId,
            code,
          });
        }
      });
    }

    init();
  }, [socketRef, roomId, onCodeChange]);

  useEffect(() => {
    if (!socketRef.current) return;

    const handleCodeChange = ({ code }) => {
      if (code !== null && editorRef.current) {
        // Only set if different, to avoid infinite loop
        if (editorRef.current.getValue() !== code) {
          editorRef.current.setValue(code);
        }
      }
    };

    socketRef.current.on(ACTIONS.CODE_CHANGE, handleCodeChange);

    return () => {
      socketRef.current.off(ACTIONS.CODE_CHANGE, handleCodeChange);
    };
  }, [socketRef]);

  return <textarea id="realtimeEditor" />;
};

export default Editor;
