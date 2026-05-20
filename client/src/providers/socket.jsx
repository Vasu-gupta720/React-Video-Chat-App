import React from "react";
import { io } from "socket.io-client";

const socketContext = React.createContext(null);

export const useSocket = () => {
    return React.useContext(socketContext);
};


export const SocketProvider = (props) => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
    const socket = React.useMemo(() => io(backendUrl), []);
    return (
        <socketContext.Provider value={socket}>
            {props.children}
        </socketContext.Provider>
    )
}