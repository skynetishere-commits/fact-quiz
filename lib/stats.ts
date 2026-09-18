import {participantLabels,type NamedParticipant} from './participants';
export type ParticipantStat={participantId:string;name:string;correctCount:number;answeredCount:number;totalQuestions:number};
export function sortParticipantStats(stats:ParticipantStat[]){return [...stats].sort((a,b)=>b.correctCount-a.correctCount||b.answeredCount-a.answeredCount||a.name.localeCompare(b.name,'ru'))}
export function participantPercentage(stat:ParticipantStat){return stat.totalQuestions?Math.round(stat.correctCount/stat.totalQuestions*100):0}
export function labeledParticipantStats(stats:ParticipantStat[]){const labels=participantLabels(stats.map(s=>({id:s.participantId,name:s.name})));return sortParticipantStats(stats).map(s=>({...s,label:labels.get(s.participantId)??s.name,percentage:participantPercentage(s)}))}
