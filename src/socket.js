import {io} from 'socket.io-client';

export const initSocket=async()=>{
    const options={
        // Removed: 'force new connection':true, as it causes repeated connections.
        reconnectionAttempt:'Infinity',
        timeout:10000,
        transports:['websocket'],
    };
    return  io(process.env.REACT_APP_BACKEND_URL,options)
}
