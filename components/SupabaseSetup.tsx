import Link from 'next/link';

type Props={title?:string;detail?:string};
export function SupabaseSetup({title='Подключите Supabase',detail='Для сетевой игры нужны URL проекта и публичный anon key.'}:Props){return <main className="container setup-page"><div className="eyebrow">НАСТРОЙКА / ONLINE MODE</div><section className="panel setup-card"><span className="setup-icon">↗</span><h1>{title}</h1><p>{detail}</p><ol><li>Создайте новый проект на supabase.com.</li><li>Выполните миграцию из <code>supabase/migrations</code>.</li><li>Скопируйте <code>.env.example</code> в <code>.env.local</code> и заполните ключи.</li><li>Перезапустите команду <code>npm run dev</code>.</li></ol><Link href="/" className="btn">← На главную</Link></section></main>}
