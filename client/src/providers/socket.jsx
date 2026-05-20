import React from "react";
import { io } from "socket.io-client";

const socketContext = React.createContext(null);

export const useSocket = () => {
    return React.useContext(socketContext);
};


export const SocketProvider = (props) => {
    const socket = React.useMemo(() => io("http://localhost:8000"), []);
    return (
        <socketContext.Provider value={socket}>
            {props.children}
        </socketContext.Provider>
    )
}