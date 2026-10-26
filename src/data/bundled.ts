import municipal from './municipal.json';
import hankyu from './hankyu.json';
import jr from './jr.json';
import kyoto from './kyoto.json';
import hanshin from './hanshin.json';
import kobeExpanded from './kobe-expanded.json';
import kobeKaigan from './kobe-kaigan.json';
import type {Timetable} from '../domain/types';

export const bundledTables = [...municipal, ...hankyu, ...jr, ...kyoto, ...hanshin, ...kobeExpanded, ...kobeKaigan] as Timetable[];
