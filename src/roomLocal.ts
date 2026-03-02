// src/roomLocal.ts
const KEY_ROOM = "mj_room_id_v1";
const KEY_NICK = "mj_nick_v1";

export function getRoomId(): string {
  return localStorage.getItem(KEY_ROOM) || "";
}
export function setRoomId(roomId: string) {
  localStorage.setItem(KEY_ROOM, roomId.trim());
}

export function getNick(): string {
  return localStorage.getItem(KEY_NICK) || "";
}
export function setNick(nick: string) {
  localStorage.setItem(KEY_NICK, nick.trim());
}