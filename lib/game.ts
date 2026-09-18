export type GameStatus='lobby'|'question_ready'|'running'|'paused'|'reveal'|'finished';
export function remainingSeconds(status:GameStatus,startedAt:number|undefined,duration:number,now=Date.now()){if(status!=='running'||!startedAt)return duration;return Math.max(0,duration-Math.floor((now-startedAt)/1000))}
export function isValidOptions(options:string[]){return options.length>=4&&options.length<=10&&options.every(Boolean)}
