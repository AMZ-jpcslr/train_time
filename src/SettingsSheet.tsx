import {useEffect,useRef,type ReactNode} from 'react';
import {useDialogHistory} from './useDialogHistory';
export default function SettingsSheet({open,title,onClose,children}:{open:boolean;title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),history=useDialogHistory(ref,onClose);
 useEffect(()=>{if(open)history.show();else history.close();return history.cancelShow;},[open]);
 return <dialog ref={ref} className="settings-sheet" aria-label={title} onCancel={e=>{e.preventDefault();history.close();}}><header><h2>{title}</h2><button autoFocus onClick={history.close}>閉じる</button></header>{children}</dialog>;
}
