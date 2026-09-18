import {describe,expect,it} from 'vitest';
import {groupVotes} from './votes';
describe('groupVotes',()=>{it('groups voters under every option and preserves IDs',()=>{const m={participantId:'m',name:'Маша',choice:0};const l={participantId:'l',name:'Лена',choice:1};const i={participantId:'i',name:'Игорь',choice:1};expect(groupVotes(['А','Б','В'],[l,i,m],1)).toEqual([{option:'А',optionIndex:0,voters:[m],isCorrect:false},{option:'Б',optionIndex:1,voters:[l,i],isCorrect:true},{option:'В',optionIndex:2,voters:[],isCorrect:false}])})});
