import { describe, expect, it } from 'vitest';
import { defaultQuestions, loadQuestions, questionSchema, saveQuestions, storageKey } from './questions';

describe('question model', () => {
  const base = defaultQuestions[0];
  it('accepts 4 to 10 options', () => {
    expect(questionSchema.safeParse(base).success).toBe(true);
    expect(questionSchema.safeParse({...base, options:['1','2','3']}).success).toBe(false);
    expect(questionSchema.safeParse({...base, options:Array.from({length:11},(_,i)=>String(i))}).success).toBe(false);
  });
  it('rejects blank values and invalid correct index', () => {
    expect(questionSchema.safeParse({...base, fact:'   '}).success).toBe(false);
    expect(questionSchema.safeParse({...base, options:['1','2',' ','4']}).success).toBe(false);
    expect(questionSchema.safeParse({...base, correctIndex:base.options.length}).success).toBe(false);
  });
  it('enforces duration range', () => {
    expect(questionSchema.safeParse({...base, durationSeconds:4}).success).toBe(false);
    expect(questionSchema.safeParse({...base, durationSeconds:301}).success).toBe(false);
  });
  it('stores and restores a valid set', () => {
    const values = new Map<string,string>();
    const storage = {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)};
    saveQuestions(storage, 'host', defaultQuestions);
    expect(values.has(storageKey('host'))).toBe(true);
    expect(loadQuestions(storage, 'host')).toEqual(defaultQuestions);
  });
  it('falls back for corrupted storage', () => {
    const storage = {getItem:()=>'{oops'};
    expect(loadQuestions(storage, 'host')).toEqual(defaultQuestions);
  });
});
