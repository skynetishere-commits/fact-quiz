'use client';
import {use,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ConfirmDialog} from '../../../components/ConfirmDialog';
import {ConnectionStatus} from '../../../components/ConnectionStatus';
import {HostLobby} from '../../../components/HostLobby';
import {QuestionEditor} from '../../../components/QuestionEditor';
import {ParticipantStats} from '../../../components/ParticipantStats';
import {SupabaseSetup} from '../../../components/SupabaseSetup';
import {VoteGroups} from '../../../components/VoteGroups';
import {parseQuestionBackup,questionsFingerprint,serializeQuestionBackup} from '../../../lib/questionBackup';
import {createQuizRepository,mapQuizError,remainingRoomSeconds,type HostSnapshot,type SubscriptionStatus} from '../../../lib/quizRepository';
import {storageKey,type QuizQuestion} from '../../../lib/questions';
import type {ConnectionState} from '../../../lib/uiState';

export default function Host({params}:{params:Promise<{token:string}>}){
  const {token}=use(params);
  const [snapshot,setSnapshot]=useState<HostSnapshot|null>(null);
  const [mode,setMode]=useState<'edit'|'run'>('run');
  const [draft,setDraft]=useState<QuizQuestion[]>([]);
  const [baseline,setBaseline]=useState<QuizQuestion[]>([]);
  const [loadError,setLoadError]=useState('');
  const [actionError,setActionError]=useState('');
  const [publishError,setPublishError]=useState('');
  const [backupStatus,setBackupStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [now,setNow]=useState(0);
  const [connection,setConnection]=useState<ConnectionState>('connecting');
  const [copyStatus,setCopyStatus]=useState('');
  const [confirm,setConfirm]=useState<null|'reset'|'finish'|'editor'>(null);
  const dirty=questionsFingerprint(draft)!==questionsFingerprint(baseline);
  const dirtyRef=useRef(dirty);useEffect(()=>{dirtyRef.current=dirty},[dirty]);
  const initialized=useRef(false);const finalizeRequested=useRef(false);
  const repo=useMemo(()=>{try{return createQuizRepository()}catch{return null}},[]);

  const load=useCallback(async()=>{if(!repo)return;try{const value=await repo.getHostSnapshot(token);setSnapshot(value);if(!initialized.current||!dirtyRef.current){setBaseline(value.questions);setDraft(value.questions);initialized.current=true}setLoadError('')}catch(error){setLoadError(mapQuizError(error).message)}},[repo,token]);
  useEffect(()=>{setNow(Date.now());void load()},[load]);
  useEffect(()=>{if(!repo||!snapshot)return;const mapStatus=(status:SubscriptionStatus):ConnectionState=>status==='SUBSCRIBED'?'connected':status==='TIMED_OUT'?'reconnecting':status==='CLOSED'?'disconnected':status==='CHANNEL_ERROR'?'error':'connecting';const sub=repo.subscribeToRoomSignals(snapshot.room.code,load,error=>{setConnection('error');setLoadError(error.message)},status=>setConnection(mapStatus(status)));return()=>{void sub.unsubscribe()}},[repo,snapshot?.room.code,load]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!snapshot||!repo)return;const timer=window.setInterval(()=>void load(),15000);return()=>clearInterval(timer)},[snapshot?.room.code,repo,load]);
  useEffect(()=>{if(!dirty||draft.length===0)return;setBackupStatus('Сохраняем черновик…');const timer=window.setTimeout(()=>{try{localStorage.setItem(storageKey(token),serializeQuestionBackup(draft));setBackupStatus('Черновик сохранён локально')}catch{setBackupStatus('Не удалось сохранить локальный черновик')}},700);return()=>window.clearTimeout(timer)},[draft,dirty,token]);

  const seconds=snapshot?remainingRoomSeconds(snapshot.room,snapshot.serverTime,now):null;
  useEffect(()=>{if(!snapshot||!repo||snapshot.room.status!=='running'||seconds!==0||finalizeRequested.current)return;finalizeRequested.current=true;void repo.finalizeExpiredQuestion(snapshot.room.code).then(load).catch(error=>setActionError(mapQuizError(error).message)).finally(()=>{finalizeRequested.current=false})},[snapshot?.room.status,snapshot?.room.code,seconds,repo,load]);

  async function action(fn:()=>Promise<void>){setBusy(true);setActionError('');try{await fn();await load()}catch(error){setActionError(mapQuizError(error).message)}finally{setBusy(false)}}
  async function publish(){if(!repo)return;setSaving(true);setPublishError('');try{const saved=await repo.saveQuestions(token,draft);setDraft(saved);setBaseline(saved);localStorage.removeItem(storageKey(token));setBackupStatus('Вопросы сохранены в комнате');await load()}catch(error){setPublishError(mapQuizError(error).message)}finally{setSaving(false)}}
  function exportBackup(){const blob=new Blob([serializeQuestionBackup(draft)],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`fact-quiz-${new Date().toISOString().slice(0,10)}.json`;anchor.click();URL.revokeObjectURL(url)}
  async function importFile(file:File){setPublishError('');try{if(file.size>1024*1024)throw new Error('Файл больше 1 МБ');const questions=parseQuestionBackup(await file.text());setDraft(questions);setBackupStatus(`Импортировано: ${questions.length} вопросов. Сохраните их в комнате.`)}catch(error){setPublishError(error instanceof Error?error.message:'Не удалось импортировать файл')}}
  async function copy(value:string,label:string){try{await navigator.clipboard.writeText(value);setCopyStatus(label);window.setTimeout(()=>setCopyStatus(''),2200)}catch{setCopyStatus('Не удалось скопировать. Выделите значение вручную.')}}

  if(!repo)return <SupabaseSetup/>;
  if(!snapshot)return loadError?<SupabaseSetup title="Комната недоступна" detail={loadError}/>:<main className="container loading-view"><div className="eyebrow">ЗАГРУЖАЕМ КОМНАТУ…</div></main>;
  const {room}=snapshot;const status=room.status;const q=snapshot.questions.find(question=>question.id===room.current_question_id)??snapshot.questions[0];const joinUrl=typeof window==='undefined'?`/join?code=${room.code}`:`${window.location.origin}/join?code=${room.code}`;
  if(mode==='edit')return <main className="container host-page"><header className="host-topbar"><div><div className="eyebrow">ФАКТ / ПАНЕЛЬ ВЕДУЩЕГО</div><div className="host-room">Комната {room.code}</div></div><ConnectionStatus state={connection}/></header><QuestionEditor questions={draft} onChange={setDraft} onRun={()=>setMode('run')} onSave={publish} onExport={exportBackup} onImportFile={importFile} saveError={publishError} dirty={dirty} saving={saving} backupStatus={backupStatus}/></main>;
  if(status==='finished')return <main className="container host-page"><header className="host-topbar"><div className="eyebrow">ВЕДУЩИЙ / ИГРА ЗАВЕРШЕНА</div><ConnectionStatus state={connection}/></header><section className="finish-card panel"><div className="eyebrow">КОМНАТА / {room.code}</div><h1>Игра завершена</h1><p>Все вопросы показаны. Можно сбросить игру и провести её заново.</p><ParticipantStats stats={snapshot.participantStats}/><div className="finish-actions"><button className="btn danger" disabled={busy} onClick={()=>setConfirm('reset')}>Сбросить игру</button></div></section><ConfirmDialog open={confirm==='reset'} title="Сбросить игру?" description="Все ответы будут удалены, игра вернётся в lobby." confirmLabel="Сбросить игру" danger onCancel={()=>setConfirm(null)} onConfirm={()=>{setConfirm(null);void action(()=>repo.resetGame(token))}}/></main>;
  if(status==='lobby'&&room.current_question_id===null)return <main className="container host-page"><header className="host-topbar"><div><div className="eyebrow">ВЕДУЩИЙ / LOBBY</div><div className="host-room">Подготовка к игре</div></div><div className="host-nav"><button className="text-btn" onClick={()=>setMode('edit')}>Редактор</button><ConnectionStatus state={connection}/></div></header>{loadError&&<div className="form-error">{loadError}</div>}<HostLobby code={room.code} joinUrl={joinUrl} participants={snapshot.participants} busy={busy} dirty={dirty} copyStatus={copyStatus} onCopyCode={()=>void copy(room.code,'Код скопирован')} onCopyLink={()=>void copy(joinUrl,'Ссылка скопирована')} onStart={()=>void action(()=>repo.startQuestion(token))}/></main>;
  const index=Math.max(0,snapshot.questions.findIndex(item=>item.id===q.id));const total=snapshot.participants.length;const answered=snapshot.answeredCount;const percent=total?Math.round(answered/total*100):0;
  return <main className="container host-page"><header className="host-topbar"><div><div className="eyebrow">ВЕДУЩИЙ / LIVE CONTROL</div><div className="host-room">Комната {room.code} · {total} участников</div></div><div className="host-nav"><button className="text-btn" disabled={busy||status==='running'} onClick={()=>status==='lobby'?setMode('edit'):setConfirm('editor')}>← Редактор</button><ConnectionStatus state={connection}/><span className="eyebrow">{status.toUpperCase()}</span></div></header>{actionError&&<div className="form-error" role="alert">{actionError}</div>}<section className="host-question"><div className="eyebrow">ВОПРОС {String(index+1).padStart(2,'0')} / {snapshot.questions.length}</div><h1>{q.fact}</h1><div className="host-timer" data-active={status==='running'}>{status==='running'?(seconds===0?'Время вышло…':`${seconds??0} сек`):status==='paused'?`${seconds??0} сек · пауза`:'Готово к запуску'}</div></section><div className="host-grid"><div className="panel host-results"><div className="answer-progress"><div><b>Ответили {answered} из {total}</b><span>Осталось {Math.max(0,total-answered)}</span></div><div className="progress-track"><span style={{width:`${percent}%`}}/></div></div><div className="host-options">{q.options.map((option,i)=><div key={`${q.id}-${i}`} className={status==='reveal'&&i===q.correctIndex?'host-option correct':'host-option'}><span>{String(i+1).padStart(2,'0')}</span><b>{option}</b><small>{status==='reveal'?snapshot.votes.filter(v=>v.choice===i).length+' гол.':'—'}</small></div>)}</div>{status==='reveal'&&<section className="vote-section"><div className="eyebrow">ДЕТАЛИЗАЦИЯ ГОЛОСОВ</div><h2>Кто за кого проголосовал</h2><VoteGroups options={q.options} votes={snapshot.votes} correctIndex={q.correctIndex}/></section>}</div><aside className="panel host-controls"><div className="eyebrow">УПРАВЛЕНИЕ</div><div className="control-buttons">{status==='lobby'&&<button className="btn primary" disabled={busy||dirty} onClick={()=>void action(()=>repo.startQuestion(token))}>Запустить вопрос ↗</button>}{status==='running'&&<><button className="btn" disabled={busy} onClick={()=>void action(()=>repo.pauseQuestion(token))}>Пауза</button><button className="btn" disabled={busy} onClick={()=>void action(()=>repo.revealQuestion(token))}>Завершить сейчас</button></>}{status==='paused'&&<><button className="btn primary" disabled={busy} onClick={()=>void action(()=>repo.resumeQuestion(token))}>Продолжить</button><button className="btn" disabled={busy} onClick={()=>void action(()=>repo.revealQuestion(token))}>Завершить сейчас</button></>}{status==='reveal'&&<button className="btn primary" disabled={busy} onClick={()=>void action(()=>repo.advanceQuestion(token))}>Следующий вопрос →</button>}</div><div className="host-note">Код: <b>{room.code}</b><br/>Ответы скрыты до раскрытия.</div></aside></div><ConfirmDialog open={confirm==='editor'} title="Вернуться в редактор?" description="Текущий ход игры будет сохранён, но редактирование доступно только в lobby." confirmLabel="Вернуться" onCancel={()=>setConfirm(null)} onConfirm={()=>{setConfirm(null);setMode('edit')}}/></main>;
}
