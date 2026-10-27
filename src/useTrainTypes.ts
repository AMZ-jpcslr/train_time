import {useState} from 'react';
import {activeTypes,readTypePreferences} from './domain/trainFilter';
const KEY='mania-u:train-types:v1';
export function useTrainTypes(context:string,available:string[],persist=true){
 const [saved,setSaved]=useState<Record<string,string[]>>(()=>{try{return persist?readTypePreferences(localStorage.getItem(KEY)):{};}catch{return {};}});
 const [saveError,setSaveError]=useState(false);
 const selected=activeTypes(saved[context]??null,available);
 const set=(value:string[]|null)=>{const next={...saved};if(value===null)delete next[context];else next[context]=value;
 const bounded=Object.fromEntries(Object.entries(next).slice(-100));setSaved(bounded);if(persist){try{localStorage.setItem(KEY,JSON.stringify(bounded));setSaveError(false);}catch{setSaveError(true);}}};
 return {selected,saveError,set};
}
