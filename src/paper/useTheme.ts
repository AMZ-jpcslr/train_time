import {useEffect,useState} from 'react';
export type Theme='light'|'dark';
const key='mania-u:theme';
function initial():{theme:Theme;explicit:boolean}{
 try{const value=localStorage.getItem(key);if(value==='light'||value==='dark')return{theme:value,explicit:true};}catch{}
 return{theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',explicit:false};
}
export function useTheme(enabled:boolean){
 const [choice,setChoice]=useState(initial),[error,setError]=useState(false);
 useEffect(()=>{if(!enabled)return;const query=matchMedia('(prefers-color-scheme: dark)');
 const change=()=>setChoice(old=>old.explicit?old:{theme:query.matches?'dark':'light',explicit:false});
 query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[enabled]);
 useEffect(()=>{if(!enabled)return;document.documentElement.dataset.theme=choice.theme;
 document.documentElement.style.colorScheme=choice.theme;},[enabled,choice.theme]);
 const toggle=()=>{const theme=choice.theme==='dark'?'light':'dark';setChoice({theme,explicit:true});
 try{localStorage.setItem(key,theme);setError(false);}catch{setError(true);}};
 return{theme:choice.theme,toggle,error};
}
