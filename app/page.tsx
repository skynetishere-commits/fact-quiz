import Link from 'next/link';
import {CreateRoomButton} from '../components/CreateRoomButton';

export default function Home() {
  return <main>
    <header className="container" style={{paddingTop:28,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div className="eyebrow">ФАКТ / КТО ЭТО?</div><div style={{fontSize:13,color:'var(--muted)'}}>QUIZ SYSTEM <span style={{color:'var(--emerald)'}}>●</span></div>
    </header>
    <section className="container" style={{padding:'clamp(65px,10vw,130px) 0 95px',position:'relative'}}>
      <div className="hero-layout">
        <div><h1 className="display">Угадайте,<br/><span style={{color:'var(--emerald)'}}>про кого</span> факт</h1><p style={{maxWidth:520,fontSize:18,lineHeight:1.5,color:'var(--muted)',margin:'36px 0'}}>Ведущий задаёт факт, команда выбирает героя. Один вопрос — один голос — много неожиданных открытий.</p><div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-start'}}><Link href="/join" className="btn primary">Войти в игру <span>↗</span></Link><CreateRoomButton/></div></div>
        <div className="hero-art" aria-label="3D иллюстрация квиза с вопросом и вариантами ответа"><div className="quiz-orbit"/><div className="quiz-mark" aria-hidden="true">?</div><div className="quiz-options" aria-hidden="true"><span>A</span><span>B</span><span className="is-picked">C</span><span>D</span></div><div className="quiz-pawn pawn-one"/><div className="quiz-pawn pawn-two"/><div className="quiz-pawn pawn-three"/></div>
      </div>
      <div style={{position:'absolute',right:0,bottom:15,fontSize:13,color:'var(--muted)',writingMode:'vertical-rl'}}>QUIZ • REALTIME READY</div>
    </section>
    <section className="container" style={{borderTop:'1px solid var(--line)',padding:'28px 0 100px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20}}>
      {[['01','Войдите','Имя сохраняется — не нужно представляться снова.'],['02','Выберите','От 4 до 10 вариантов, только один правильный.'],['03','Узнайте','После таймера видны ответы всей команды.']].map(([n,t,d])=><div key={n}><div style={{color:'var(--emerald)',fontSize:14,marginBottom:25}}>{n} /</div><h2 style={{fontSize:25,margin:'0 0 10px'}}>{t}</h2><p style={{color:'var(--muted)',lineHeight:1.45,margin:0}}>{d}</p></div>)}
    </section>
  </main>
}
