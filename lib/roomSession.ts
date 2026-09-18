import { roomCodeSchema } from './roomSchemas';

const PARTICIPANT_SECRET_PREFIX = 'fact-quiz:participant-secret:v1';

export type RoomSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function normalizeRoomCode(code: string): string {
  return roomCodeSchema.parse(code);
}

export function participantSecretKey(code: string): string {
  return `${PARTICIPANT_SECRET_PREFIX}:${normalizeRoomCode(code)}`;
}

export function getParticipantSecret(storage: Pick<Storage, 'getItem'>, code: string): string | null {
  try {
    return storage.getItem(participantSecretKey(code));
  } catch {
    return null;
  }
}

export function setParticipantSecret(
  storage: Pick<Storage, 'setItem'>,
  code: string,
  secret: string,
): void {
  storage.setItem(participantSecretKey(code), secret);
}

export function clearParticipantSecret(
  storage: Pick<Storage, 'removeItem'>,
  code: string,
): void {
  storage.removeItem(participantSecretKey(code));
}
