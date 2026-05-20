import { Routes, Route } from 'react-router-dom';

import './App.css';

import Homepage from './pages/home';
import { SocketProvider } from './providers/socket';
import { PeerProvider } from './providers/peer';
import RoomPage from './pages/room';

function App() {
  return (
    <div className="App">

      <SocketProvider>
        <PeerProvider>
          <Routes>

            <Route path="/" element={<Homepage />} />
            <Route path="/room/:id" element={<RoomPage />} />

          </Routes>
        </PeerProvider>
      </SocketProvider>

    </div>
  );
}

export default App;
