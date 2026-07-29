import { io } from "socket.io-client";

const ROOM_ID = "2c2ebbd3-4235-49d8-91dc-04cde442f67a";

const socket = io("http://localhost:4000");

socket.on("connect", () => {
  console.log("JOINER:", socket.id);

  socket.emit(
    "room:join",
    {
      roomId: ROOM_ID,
      displayName: "Alice",
    },
    (response: any) => {
      console.log("JOIN RESPONSE");
      console.log(response);

      socket.disconnect();
    },
  );
});