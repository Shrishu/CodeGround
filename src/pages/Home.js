import React, { useState } from 'react';
import {v4 as uuidV4} from 'uuid';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate=useNavigate();
  const [roomId,setRoomId]=useState('');
  const [username,setUsername]=useState('');
  const createNewRoom=(e)=>{
        e.preventDefault();
        
        const id=uuidV4();
        setRoomId(id);
       // console.log(id);
       toast.success('Created a new room')
  }
  const joinRoom=()=>{
    if(!roomId || !username){
      toast.error('Room Id and user name is required');
      return ;
    }
    //redirect
     navigate(`/editor/${roomId}`,{
      state:{
        username,
      },
     })
  }
  const handleInputEnter=(e)=>{
   // console.log('event',e.code);
    if(e.code==='Enter'){
      joinRoom();
    }
  }
  return (
    <div className='HomePageWrapper'>
        <div className='formwrapper'>
           <img className='homePageLogo' width="300px"src="/code.png"/>
           <h4 className='MainLabel'>Join The Code Room</h4>
           <div className='inputGroup'>
            <input type='text' className='inputBox' placeholder='Room ID' onChange={(e)=>setRoomId(e.target.value)}value={roomId} onKeyUp={handleInputEnter}/>
            <input type='text' className='inputBox' placeholder='User Name' onChange={(e)=>setUsername(e.target.value)}value={username} onKeyUp={handleInputEnter}/>

            <button className='btn joinBtn' onClick={joinRoom}>JOIN</button>
            <span className='createInfo'>
                if you don't have an invite then create &nbsp; 
                <a onClick={createNewRoom} href='' className='createNewBtn'>New Room</a>
            </span>
           </div>
        </div>
        <footer>
            <h4>CopyRight @2024</h4>
        </footer>
    </div>
  )
}

export default Home
