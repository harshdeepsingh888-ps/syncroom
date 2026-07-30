import { InMemoryRoomRepository } from "./repository/index.js";
import { RoomService } from "./service/index.js";

export const roomRepository = new InMemoryRoomRepository();

export const roomService = new RoomService(roomRepository);