export function nextQuestionIndex(current:number,total:number):number|null{return current+1<total?current+1:null}
export function questionProgress(current:number,total:number){return `ВОПРОС ${String(current+1).padStart(2,'0')} / ${total}`}
