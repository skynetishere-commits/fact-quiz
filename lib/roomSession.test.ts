import { describe, expect, it } from 'vitest';
import {
  clearParticipantSecret,
  getParticipantSecret,
  normalizeRoomCode,
  participantSecretKey,
  setParticipantSecret,
} from './roomSession';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('room participant sessions', () => {
  it('normalizes codes and scopes secrets to each room', () => {
    const storage = memoryStorage();
    setParticipantSecret(storage, ' room42 ', 'secret-for-room-42');
    setParticipantSecret(storage, 'other', 'secret-for-other');

    expect(normalizeRoomCode(' room42 ')).toBe('ROOM42');
    expect(participantSecretKey('room42')).toBe('fact-quiz:participant-secret:v1:ROOM42');
    expect(getParticipantSecret(storage, 'ROOM42')).toBe('secret-for-room-42');
    expect(getParticipantSecret(storage, 'OTHER')).toBe('secret-for-other');
  });

  it('clears only the requested room and safely handles failed reads', () => {
    const storage = memoryStorage();
    setParticipantSecret(storage, 'one', 'secret-for-room-one');
    setParticipantSecret(storage, 'two', 'secret-for-room-two');
    clearParticipantSecret(storage, 'one');

    expect(getParticipantSecret(storage, 'one')).toBeNull();
    expect(getParticipantSecret(storage, 'two')).toBe('secret-for-room-two');
    expect(getParticipantSecret({ getItem: () => { throw new Error('blocked'); } }, 'two')).toBeNull();
  });
});
