const ACTIONS = {
    JOIN: 'join',
    JOINED: 'joined',
    DISCONNECTED: 'disconnected',
    CODE_CHANGE: 'code-change',
    SYNC_CODE: 'sync-code', // Existing for code only
    SYNC_ALL_CODE: 'sync-all-code', // New: for syncing all editor state on join
    LANGUAGE_CHANGE: 'language-change', // New: for language changes
    INPUT_CHANGE: 'input-change', // New: for input box changes
    OUTPUT_CHANGE: 'output-change', // New: for output box changes
    LEAVE: 'leave'
}


module.exports = ACTIONS;
