import type { Room } from "../domain/index.js";

export interface RoomRepository {
  save(room: Room): void;
  findById(roomId: string): Room | null;
  deleteById(roomId: string): boolean;
}