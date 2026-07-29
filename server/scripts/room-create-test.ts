import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:4000";

console.log(`Connecting to ${SERVER_URL}...`);

const socket = io(SERVER_URL, {
  timeout: 5000,
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("Connected:", socket.id);

  socket.emit(
    "room:create",
    {
      displayName: "Harshdeep",
    },
    (response: unknown) => {
      console.log("Acknowledgement received:");
      console.log(response);

      socket.disconnect();
    },
  );
});

socket.on("connect_error", (error) => {
  console.error("Connection failed:", error.message);
  socket.disconnect();
  process.exit(1);
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
  process.exit(0);
});

setTimeout(() => {
  console.error("Test timed out after 10 seconds.");
  socket.disconnect();
  process.exit(1);
}, 10_000);