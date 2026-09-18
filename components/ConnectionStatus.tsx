import {connectionLabels,type ConnectionState} from '../lib/uiState';
export function ConnectionStatus({state}:{state:ConnectionState}){return <div className={`connection-status ${state}`} role="status" aria-live="polite"><span aria-hidden="true"/>{connectionLabels[state]}</div>}
