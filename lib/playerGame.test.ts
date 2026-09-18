import {describe,expect,it} from 'vitest';
import {nextQuestionIndex,questionProgress} from './playerGame';
describe('player question navigation',()=>{it('formats first question progress',()=>expect(questionProgress(0,10)).toBe('ВОПРОС 01 / 10'));it('advances through intermediate questions',()=>expect(nextQuestionIndex(4,10)).toBe(5));it('ends after the final question',()=>expect(nextQuestionIndex(9,10)).toBeNull())});
