'use client';
import {useState} from 'react';
export function HostLogoutButton(){const [busy,setBusy]=useState(false);async function logout(){setBusy(true);try{await fetch('/api/host/logout',{method:'POST',credentials:'same-origin'})}finally{window.location.assign('/')}}return <button type="button" className="text-btn" disabled={busy} onClick={()=>void logout()}>{busy?'Выходим…':'Выйти'}</button>}
