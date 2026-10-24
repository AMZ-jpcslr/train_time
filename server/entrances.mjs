import {readFile} from 'node:fs/promises';
export async function loadEntrances(){
 // Literal URLs let the serverless dependency tracer include only these JSON files.
 const parts=await Promise.all([
  readFile(new URL('../src/data/entrances.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../src/data/added-entrances.json',import.meta.url),'utf8').then(JSON.parse)
 ]);
 return parts.flat();
}
