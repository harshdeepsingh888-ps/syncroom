import { io } from "socket.io-client";

const socket = io("http://localhost:4000");

socket.on("connect", () => {
  console.log("HOST:", socket.id);

  socket.emit(
    "room:create",
    {
      displayName: "Harshdeep",
    },
    (response: any) => {
      console.log("ROOM CREATED");
      console.log(response);

      if (!response.success) return;

      console.log();
      console.log("COPY THIS ROOM ID:");
      console.log(response.roomId);
      console.log();

      globalThis.roomId = response.roomId;
    },
  );
});

socket.on("participant:joined", (event) => {
  console.log();
  console.log("NEW PARTICIPANT JOINED");
  console.log(event);
});