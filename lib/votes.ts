export type Vote={participantId?:string;name:string;choice:number};
export type VoteGroup={option:string;optionIndex:number;voters:Vote[];isCorrect:boolean};
export function groupVotes(options:string[],votes:Vote[],correctIndex:number):VoteGroup[]{return options.map((option,optionIndex)=>({option,optionIndex,voters:votes.filter(v=>v.choice===optionIndex),isCorrect:optionIndex===correctIndex}))}
