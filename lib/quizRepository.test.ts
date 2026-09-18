import {describe, expect, it, vi} from 'vitest';
import {defaultQuestions} from './questions';
import {createQuizRepository, mapQuizError, questionFromDto, questionToDto, remainingRoomSeconds} from './quizRepository';
import {hostSnapshotDtoSchema} from './roomSchemas';
import type {RoomState} from './roomSchemas';

function room(overrides: Partial<RoomState>): RoomState {
  return {code:'ROOM42',status:'lobby',current_question_id:null,state_version:1,question_started_at:null,question_ends_at:null,paused_remaining_ms:null,...overrides};
}
const questionId = '10000000-0000-4000-8000-000000000001';
const snapshot = {
  server_time:'2026-09-16T12:00:00.000Z',
  room:room({status:'running',current_question_id:questionId,question_ends_at:'2026-09-16T12:00:10.000Z'}),
  questions:[{id:questionId,fact:'Fact',options:['A','B','C','D'],correct_index:0,duration_seconds:30}],
  participants:[],
  answered_count:2,
  answers:[],
  participant_stats:[],
};

describe('quiz repository mappers',()=>{
  it('round-trips canonical questions',()=>{const q=defaultQuestions[0];const dto=questionToDto(q);expect(dto.correct_index).toBe(q.correctIndex);expect(questionFromDto(dto)).toEqual(q)});
  it('rejects invalid external payloads',()=>expect(()=>questionFromDto({id:'bad',fact:'Fact',options:['A','B','C','D'],correct_index:4,duration_seconds:30})).toThrow());
  it('accepts a host count without exposing pre-reveal answers',()=>{const parsed=hostSnapshotDtoSchema.parse(snapshot);expect(parsed.answered_count).toBe(2);expect(parsed.answers).toEqual([])});
});

describe('server timer helper',()=>{
  const server='2026-09-16T12:00:00.000Z';
  it('uses the server deadline',()=>expect(remainingRoomSeconds(room({status:'running',question_ends_at:'2026-09-16T12:00:10.000Z'}),server,Date.parse('2026-09-16T12:00:00.000Z'))).toBe(10));
  it('uses paused milliseconds and clamps deadlines',()=>{expect(remainingRoomSeconds(room({status:'paused',paused_remaining_ms:1501}),server)).toBe(2);expect(remainingRoomSeconds(room({status:'running',question_ends_at:'2026-09-16T11:59:59.000Z'}),server,Date.parse(server))).toBe(0);expect(remainingRoomSeconds(room({status:'reveal'}),server)).toBeNull()});
});

describe('repository reliability',()=>{
  it('maps known database errors to friendly messages and preserves unknown ones',()=>{
    expect(mapQuizError(new Error('submit_answer failed: answer_already_submitted')).message).toBe('Ваш ответ уже принят');
    expect(mapQuizError(new Error('network offline')).message).toBe('Нет соединения. Проверяем подключение…');
  });

  it('normalizes the room code when finalizing an expired question',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:{finalized:true,state_version:7},error:null});
    const repo=createQuizRepository({rpc} as never);
    const result=await repo.finalizeExpiredQuestion(' room42 ');
    expect(rpc).toHaveBeenCalledWith('finalize_expired_question',{p_code:'ROOM42'});
    expect(result).toEqual({finalized:true,state_version:7});
  });

  it('reports subscription states and reconciles after reconnect-related states',async()=>{
    let callback: ((status:string,error?:Error)=>void) | undefined;
    const channel={on:vi.fn().mockReturnThis(),subscribe:vi.fn((cb)=>{callback=cb;return channel})};
    const client={channel:vi.fn(()=>channel),removeChannel:vi.fn().mockResolvedValue('ok')};
    const refetch=vi.fn().mockResolvedValue(undefined);
    const statuses:string[]=[];
    const errors:Error[]=[];
    const sub=createQuizRepository(client as never).subscribeToRoomSignals('room42',refetch,e=>errors.push(e),s=>statuses.push(s));
    callback?.('SUBSCRIBED');
    callback?.('TIMED_OUT');
    callback?.('CHANNEL_ERROR',new Error('socket failed'));
    await Promise.resolve();
    expect(statuses).toEqual(['SUBSCRIBED','TIMED_OUT','CHANNEL_ERROR']);
    expect(refetch).toHaveBeenCalledTimes(3);
    expect(errors[0]?.message).toBe('socket failed');
    await sub.unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
