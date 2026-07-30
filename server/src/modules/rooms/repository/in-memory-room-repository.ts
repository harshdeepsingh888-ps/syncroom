import type { Room } from "../domain/index.js";

import type { RoomRepository } from "./room-repository.js";

export class InMemoryRoomRepository implements RoomRepository {
  private readonly rooms = new Map<string, Room>();

  public save(room: Room): void {
    this.rooms.set(room.id, room);
  }

  public findById(roomId: string): Room | null {
    return this.rooms.get(roomId) ?? null;
  }

  public findAll(): Room[] {
    return Array.from(this.rooms.values());
  }

  public deleteById(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }
}